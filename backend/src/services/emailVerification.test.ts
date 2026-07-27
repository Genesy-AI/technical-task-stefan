import { describe, expect, it, vi } from 'vitest'
import { TestWorkflowEnvironment } from '@temporalio/testing'
import {
  EmailVerificationRepository,
  EmailVerificationServiceUnavailableError,
  VerificationConnection,
  verifyEmailBatch,
} from './emailVerification'

const leads = [
  { id: 1, email: 'verified@example.com', firstName: 'Verified', lastName: 'Lead' },
  { id: 2, email: 'missing@example.com', firstName: 'Missing', lastName: 'Lead' },
  { id: 3, email: 'failed@example.com', firstName: 'Failed', lastName: 'Lead' },
]

function createRepository() {
  const states = new Map<number, { runId: string; status: string; emailVerified: boolean | null }>()

  const repository: EmailVerificationRepository = {
    markPending: vi.fn(async (leadIds, runId) => {
      leadIds.forEach((leadId: number) => {
        states.set(leadId, { runId, status: 'pending', emailVerified: null })
      })
    }),
    saveResult: vi.fn(async (leadId, runId, emailVerified) => {
      const current = states.get(leadId)
      if (current?.runId === runId) {
        states.set(leadId, {
          runId,
          status: emailVerified ? 'verified' : 'not_verified',
          emailVerified,
        })
      }
    }),
    saveFailure: vi.fn(async (leadId, runId) => {
      const current = states.get(leadId)
      if (current?.runId === runId) {
        states.set(leadId, { runId, status: 'failed', emailVerified: null })
      }
    }),
  }

  return { repository, states }
}

function createConnection(execute: VerificationConnection['workflow']['execute']): VerificationConnection {
  return {
    workflow: { execute },
    close: vi.fn(async () => undefined),
  }
}

describe('verifyEmailBatch', () => {
  it('persists mixed terminal outcomes and sets a workflow execution timeout', async () => {
    const { repository, states } = createRepository()
    const leadIdsByEmail = new Map(leads.map((lead) => [lead.email, lead.id]))
    const execute = vi.fn(async (_workflow, options) => {
      expect(options.workflowExecutionTimeout).toBe('1 minute')
      expect(options.workflowId).toBe(`verify-email-${leadIdsByEmail.get(options.args[0])}`)

      if (options.args[0] === 'failed@example.com') {
        throw new Error('Provider unavailable')
      }

      return options.args[0] === 'verified@example.com'
    })

    const outcome = await verifyEmailBatch({
      leads,
      repository,
      connect: async () => createConnection(execute),
      runId: 'run-1',
    })

    expect(outcome.results).toEqual([
      { leadId: 1, emailVerified: true },
      { leadId: 2, emailVerified: false },
    ])
    expect(outcome.errors).toEqual([{ leadId: 3, leadName: 'Failed Lead', error: 'Provider unavailable' }])
    expect(states.get(1)?.status).toBe('verified')
    expect(states.get(2)?.status).toBe('not_verified')
    expect(states.get(3)?.status).toBe('failed')
  })

  it('persists failure when Temporal cannot be reached', async () => {
    const { repository, states } = createRepository()

    await expect(
      verifyEmailBatch({
        leads: [leads[0]],
        repository,
        connect: async () => {
          throw new Error('connection refused')
        },
        runId: 'run-1',
      })
    ).rejects.toBeInstanceOf(EmailVerificationServiceUnavailableError)

    expect(states.get(1)?.status).toBe('failed')
  })

  it('reaches a failed persisted outcome when no worker polls the task queue', async () => {
    const environment = await TestWorkflowEnvironment.createLocal()
    const { repository, states } = createRepository()

    try {
      const outcome = await verifyEmailBatch({
        leads: [leads[0]],
        repository,
        connect: async () => ({
          workflow: {
            execute: (workflow, options) => environment.client.workflow.execute(workflow, options),
          },
          close: async () => undefined,
        }),
        runId: 'run-without-worker',
        workflowExecutionTimeout: '1 second',
      })

      expect(outcome.errors).toHaveLength(1)
      expect(states.get(1)?.status).toBe('failed')
    } finally {
      await environment.teardown()
    }
  }, 15_000)

  it('does not let an older request overwrite a newer verification state', async () => {
    const { repository, states } = createRepository()
    let finishFirst: ((value: boolean) => void) | undefined
    const firstResult = new Promise<boolean>((resolve) => {
      finishFirst = resolve
    })

    const firstRequest = verifyEmailBatch({
      leads: [leads[0]],
      repository,
      connect: async () => createConnection(async () => firstResult),
      runId: 'older-run',
    })

    await vi.waitFor(() => expect(states.get(1)?.runId).toBe('older-run'))

    await verifyEmailBatch({
      leads: [leads[0]],
      repository,
      connect: async () => createConnection(async () => false),
      runId: 'newer-run',
    })

    finishFirst?.(true)
    await firstRequest

    expect(states.get(1)).toEqual({
      runId: 'newer-run',
      status: 'not_verified',
      emailVerified: false,
    })
  })
})
