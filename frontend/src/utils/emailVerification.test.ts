import { describe, expect, it } from 'vitest'
import { getEmailVerificationErrorMessage, getEmailVerificationSummary } from './emailVerification'

describe('email verification feedback', () => {
  it('summarizes mixed batch outcomes', () => {
    expect(
      getEmailVerificationSummary({
        verifiedCount: 2,
        results: [
          { leadId: 1, emailVerified: true },
          { leadId: 2, emailVerified: true },
          { leadId: 3, emailVerified: false },
        ],
        errors: [{ leadId: 4, leadName: 'Failed Lead', error: 'Timed out' }],
      })
    ).toEqual({
      hasErrors: true,
      message: 'Verification complete: 2 verified, 1 not verified, 1 failed.',
    })
  })

  it('uses a safe actionable API error when available', () => {
    const error = {
      isAxiosError: true,
      response: {
        data: {
          error: 'Email verification service is unavailable. Please try again shortly.',
        },
      },
    }

    expect(getEmailVerificationErrorMessage(error)).toBe(
      'Email verification service is unavailable. Please try again shortly.'
    )
  })
})
