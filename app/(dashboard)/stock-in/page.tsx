import StockInClient from './StockInClient'
import { requireSession } from '@/lib/server-auth'

export default async function StockInPage() {
  await requireSession()
  return <StockInClient />
}
