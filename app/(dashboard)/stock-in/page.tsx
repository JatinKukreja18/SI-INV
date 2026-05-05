import StockInClient from './StockInClient'
import { requireAdminPage } from '@/lib/server-auth'

export default async function StockInPage() {
  await requireAdminPage()
  return <StockInClient />
}
