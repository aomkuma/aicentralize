export const INDIVIDUAL_PACKAGE_CODE = 'INDIVIDUAL'

export function isIndividualPackage(packageCode: string | null | undefined): boolean {
  return packageCode?.trim().toUpperCase() === INDIVIDUAL_PACKAGE_CODE
}

export function canAccessFeelingLogs(packageCode: string | null | undefined): boolean {
  return !isIndividualPackage(packageCode)
}
