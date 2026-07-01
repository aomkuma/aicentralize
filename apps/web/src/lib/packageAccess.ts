import type { FeatureKey } from '../types/features'

export const INDIVIDUAL_PACKAGE_CODE = 'INDIVIDUAL'

export function isIndividualPackage(packageCode: string | null | undefined): boolean {
  return packageCode?.trim().toUpperCase() === INDIVIDUAL_PACKAGE_CODE
}

export function canAccessFeelingLogs(packageCode: string | null | undefined): boolean {
  return !isIndividualPackage(packageCode)
}

export function canManageOrganizationTeam(packageCode: string | null | undefined): boolean {
  return !isIndividualPackage(packageCode)
}

export function canCreateProjectForPackage(
  existingProjectCount: number,
  maxProjects: number | null | undefined,
): boolean {
  if (!maxProjects || maxProjects <= 0) {
    return true
  }

  return existingProjectCount < maxProjects
}

export function canAccessMeetingStudio(packageCode: string | null | undefined): boolean {
  return !isIndividualPackage(packageCode)
}

export function canAccessAiChatHistory(
  packageCode: string | null | undefined,
  canAccessFeature: (feature: FeatureKey) => boolean,
): boolean {
  if (isIndividualPackage(packageCode)) {
    return canAccessFeature('AI_CHAT_BASIC')
  }

  return canAccessFeature('AI_TRACE_PANEL')
}
