import { describe, expect, it } from 'vitest'
import { isValidBulkImportLead, normalizeCountryCode } from './leadValidation'

describe('isValidBulkImportLead', () => {
  it.each(['12', 'XXX', 'ZZ'])('rejects invalid country code %s', (countryCode) => {
    const lead = {
      firstName: 'Amanda',
      lastName: 'James',
      email: 'amanda@example.com',
      countryCode,
    }

    expect(isValidBulkImportLead(lead)).toBe(false)
  })

  it('accepts and normalizes a lowercase country code', () => {
    const lead = {
      firstName: 'Amanda',
      lastName: 'James',
      email: 'amanda@example.com',
      countryCode: 'es',
    }

    expect(isValidBulkImportLead(lead)).toBe(true)
    expect(normalizeCountryCode(lead.countryCode)).toBe('ES')
  })
})
