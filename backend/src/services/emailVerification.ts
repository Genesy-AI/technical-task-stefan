import { randomUUID } from 'node:crypto'
import { verifyEmailWorkflow } from '../workflows'

export type VerificationLead = {
  id: number
  email: string
  firstName: string
  lastName: string
}

export type VerificationResult = {
  leadId: number
  emailVerified: boolean
}

export type VerificationError = {
  leadId: number
  leadName: string
  error: string
}

export interface EmailVerificationRepository {
  markPending(leadIds: number[], runId: string): Promise<void>
  saveResult(leadId: number, runId: string, emailVerified: boolean): Promise<void>
  saveFailure(leadId: number, runId: string): Promise<void>
}

type WorkflowOptions = {
  taskQueue: string
  workflowId: string
  workflowIdReusePolicy: 'ALLOW_DUPLICATE'
  workflowIdConflictPolicy: 'USE_EXISTING'
  workflowExecutionTimeout: '1 minute' | '1 second'
  args: [string]
}

export interface VerificationConnection {
  workflow: {
    execute(workflow: typeof verifyEmailWorkflow, options: WorkflowOptions): Promise<boolean>
  }
  close(): Promise<void>
}

export class EmailVerificationServiceUnavailableError extends Error {
  constructor() {
    super('Email verification service is unavailable. Please try again shortly.')
    this.name = 'EmailVerificationServiceUnavailableError'
  }
}

type VerifyEmailBatchInput = {
  leads: VerificationLead[]
  repository: EmailVerificationRepository
  connect: () => Promise<VerificationConnection>
  runId?: string
  workflowExecutionTimeout?: '1 minute' | '1 second'
}

export async function verifyEmailBatch({
  leads,
  repository,
  connect,
  runId = randomUUID(),
  workflowExecutionTimeout = '1 minute',
}: VerifyEmailBatchInput): Promise<{
  results: VerificationResult[]
  errors: VerificationError[]
}> {
  await repository.markPending(
    leads.map((lead) => lead.id),
    runId
  )

  let connection: VerificationConnection
  try {
    connection = await connect()
  } catch {
    await Promise.all(leads.map((lead) => repository.saveFailure(lead.id, runId)))
    throw new EmailVerificationServiceUnavailableError()
  }

  try {
    const outcomes = await Promise.all(
      leads.map(async (lead) => {
        try {
          const emailVerified = await connection.workflow.execute(verifyEmailWorkflow, {
            taskQueue: 'myQueue',
            workflowId: `verify-email-${lead.id}`,
            workflowIdReusePolicy: 'ALLOW_DUPLICATE',
            workflowIdConflictPolicy: 'USE_EXISTING',
            workflowExecutionTimeout,
            args: [lead.email],
          })

          await repository.saveResult(lead.id, runId, emailVerified)
          return { result: { leadId: lead.id, emailVerified } }
        } catch (error) {
          await repository.saveFailure(lead.id, runId)
          return {
            error: {
              leadId: lead.id,
              leadName: `${lead.firstName} ${lead.lastName}`.trim(),
              error: error instanceof Error ? error.message : 'Unknown error',
            },
          }
        }
      })
    )

    return {
      results: outcomes.flatMap((outcome) => (outcome.result ? [outcome.result] : [])),
      errors: outcomes.flatMap((outcome) => (outcome.error ? [outcome.error] : [])),
    }
  } finally {
    await connection.close()
  }
}
