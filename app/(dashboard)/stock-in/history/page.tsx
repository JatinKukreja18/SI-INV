import BatchHistoryClient from './BatchHistoryClient'
import { requireSession } from '@/lib/server-auth'

export default async function BatchHistoryPage() {
  await requireSession()
  return <BatchHistoryClient />
}
