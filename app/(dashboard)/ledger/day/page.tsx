import DayLedgerClient from './DayLedgerClient'
import { requireAdminPage } from '@/lib/server-auth'

export default async function DayLedgerPage() {
  await requireAdminPage()
  return <DayLedgerClient />
}
