import isoAlpha2CountryCodes from '../../../shared/isoAlpha2CountryCodes.json'

const ISO_ALPHA_2_COUNTRY_CODES = new Set(isoAlpha2CountryCodes.codes.split(/\s+/))

export const normalizeCountryCode = (value: string | null | undefined): string | undefined => {
  const normalized = value?.trim().toUpperCase()
  return normalized && ISO_ALPHA_2_COUNTRY_CODES.has(normalized) ? normalized : undefined
}

export const isValidCountryCode = (value: string): boolean => normalizeCountryCode(value) !== undefined
