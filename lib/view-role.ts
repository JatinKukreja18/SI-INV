import { cookies } from 'next/headers'
import type { Role } from '@/types'
import { VIEW_ROLE_COOKIE } from '@/lib/view-role-shared'

function isRole(value: string | undefined): value is Role {
  return value === 'admin' || value === 'staff'
}

export async function getEffectiveRole(actualRole: Role): Promise<Role> {
  if (actualRole !== 'admin') {
    return actualRole
  }

  const cookieStore = await cookies()
  const previewRole = cookieStore.get(VIEW_ROLE_COOKIE)?.value

  return isRole(previewRole) ? previewRole : 'admin'
}
