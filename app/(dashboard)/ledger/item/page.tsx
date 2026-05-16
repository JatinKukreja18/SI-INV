import ItemLedgerClient from './ItemLedgerClient'
import { requireAdminPage } from '@/lib/server-auth'

export default async function ItemLedgerPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  await requireAdminPage()
  const { code } = await searchParams
  return <ItemLedgerClient initialCode={code} />
}
