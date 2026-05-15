import BatchHistoryClient from './BatchHistoryClient'
import { requireAdminPage } from '@/lib/server-auth'

export default async function BatchHistoryPage() {
  await requireAdminPage()
  return <BatchHistoryClient />
}
