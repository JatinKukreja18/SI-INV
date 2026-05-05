import ItemLedgerClient from './ItemLedgerClient'
import { requireAdminPage } from '@/lib/server-auth'

export default async function ItemLedgerPage() {
  await requireAdminPage()
  return <ItemLedgerClient />
}
