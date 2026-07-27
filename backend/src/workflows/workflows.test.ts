import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { TestWorkflowEnvironment } from '@temporalio/testing'
import { Worker } from '@temporalio/worker'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { verifyEmailWorkflow } from './workflows'

describe('verifyEmailWorkflow', () => {
  let testEnvironment: TestWorkflowEnvironment | undefined

  beforeAll(async () => {
    testEnvironment = await TestWorkflowEnvironment.createLocal()
  }, 120_000)

  afterAll(async () => {
    await testEnvironment?.teardown()
  })

  async function runVerification(
    verifyEmail: () => Promise<boolean>,
    email: string,
    assertOutcome: (result: Promise<boolean>) => Promise<void>,
  ) {
    if (!testEnvironment) {
      throw new Error('Temporal test environment is unavailable')
    }

    const environment = testEnvironment
    const taskQueue = `verify-email-${randomUUID()}`
    const worker = await Worker.create({
      connection: environment.nativeConnection,
      namespace: environment.namespace,
      taskQueue,
      workflowsPath: path.resolve(__dirname, 'workflows.ts'),
      activities: { verifyEmail },
    })

    await worker.runUntil(async () => {
      const handle = await environment.client.workflow.start(verifyEmailWorkflow, {
        taskQueue,
        workflowId: randomUUID(),
        args: [email],
      })

      try {
        await assertOutcome(handle.result())
      } finally {
        await handle.cancel().catch(() => undefined)
      }
    })
  }

  function withOutcomeDeadline<T>(result: Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Email verification did not reach an outcome within 4 seconds')),
        4_000,
      )

      result.then(
        (value) => {
          clearTimeout(timeout)
          resolve(value)
        },
        (error) => {
          clearTimeout(timeout)
          reject(error)
        },
      )
    })
  }

  it('reaches an outcome when verification takes longer than one second', async () => {
    await runVerification(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 1_500))
        return true
      },
      'slow@example.com',
      async (result) => {
        await expect(withOutcomeDeadline(result)).resolves.toBe(true)
      },
    )
  }, 15_000)

  it('reaches a terminal failure when verification keeps failing', async () => {
    await runVerification(
      async () => {
        throw new Error('Verification provider unavailable')
      },
      'unavailable@example.com',
      async (result) => {
        const outcome = await withOutcomeDeadline(
          result.then(
            () => 'completed',
            () => 'failed',
          ),
        )
        expect(outcome).toBe('failed')
      },
    )
  }, 15_000)
})
