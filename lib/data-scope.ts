import type { Session } from 'next-auth'
import type { DataScope } from '@/types'

export const DATA_SCOPES: DataScope[] = ['live', 'demo']

export function isDataScope(value: unknown): value is DataScope {
  return value === 'live' || value === 'demo'
}

export function getSessionDataScope(session: Session): DataScope {
  return isDataScope(session.user.dataScope) ? session.user.dataScope : 'demo'
}
