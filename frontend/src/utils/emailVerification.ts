import axios from 'axios'

type VerificationOutcome = {
  verifiedCount: number
  results: Array<{ leadId: number; emailVerified: boolean | null }>
  errors: Array<{ leadId: number; leadName: string; error: string }>
}

export function getEmailVerificationSummary(outcome: VerificationOutcome): {
  hasErrors: boolean
  message: string
} {
  const notVerifiedCount = outcome.results.filter((result) => !result.emailVerified).length

  return {
    hasErrors: outcome.errors.length > 0,
    message: `Verification complete: ${outcome.verifiedCount} verified, ${notVerifiedCount} not verified, ${outcome.errors.length} failed.`,
  }
}

export function getEmailVerificationErrorMessage(error: unknown): string {
  const responseMessage = axios.isAxiosError<{ error?: string }>(error)
    ? error.response?.data.error
    : undefined

  return responseMessage ?? 'Email verification failed. Please try again.'
}
