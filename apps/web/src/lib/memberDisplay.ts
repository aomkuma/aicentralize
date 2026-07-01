export type MemberLike = {
  nickname?: string | null
  user?: {
    id: string
    name: string
    email: string
    nickname?: string | null
  } | null
}

export function memberNickname(member: MemberLike): string {
  return member.nickname?.trim() || member.user?.nickname?.trim() || ''
}

export function buildOwnerOptionFromMembership(
  member: MemberLike,
): { id: string; name: string; email: string; nickname?: string } | null {
  const user = member.user
  if (!user?.id || !user.name || !user.email) {
    return null
  }

  const nickname = memberNickname(member)
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    nickname: nickname || undefined,
  }
}

export function formatOwnerLabel(owner: { name: string; nickname?: string | null }): string {
  const nickname = owner.nickname?.trim()
  return nickname ? `${owner.name} (@${nickname})` : owner.name
}
