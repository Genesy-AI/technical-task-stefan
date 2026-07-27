export interface BulkImportLead {
  firstName: string
  lastName: string
  email: string
  jobTitle?: string | null
  countryCode?: string | null
  companyName?: string | null
}

const isoAlpha2CountryCodes = require('../../../shared/isoAlpha2CountryCodes.json') as {
  codes: string
}

const ISO_ALPHA_2_COUNTRY_CODES = new Set(isoAlpha2CountryCodes.codes.split(/\s+/))

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && Boolean(value.trim())

const isOptionalString = (value: unknown): value is string | null | undefined =>
  value === undefined || value === null || typeof value === 'string'

export const normalizeCountryCode = (value: string | null | undefined): string | undefined => {
  const normalized = value?.trim().toUpperCase()
  return normalized && ISO_ALPHA_2_COUNTRY_CODES.has(normalized) ? normalized : undefined
}

const isValidCountryCode = (value: unknown): value is string | null | undefined =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && (value.trim() === '' || normalizeCountryCode(value) !== undefined))

export const isValidBulkImportLead = (lead: unknown): lead is BulkImportLead => {
  if (!lead || typeof lead !== 'object' || Array.isArray(lead)) {
    return false
  }

  const candidate = lead as Record<string, unknown>

  return (
    isNonEmptyString(candidate.firstName) &&
    isNonEmptyString(candidate.lastName) &&
    isNonEmptyString(candidate.email) &&
    isOptionalString(candidate.jobTitle) &&
    isValidCountryCode(candidate.countryCode) &&
    isOptionalString(candidate.companyName)
  )
}
