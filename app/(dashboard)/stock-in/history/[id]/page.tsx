import BatchDetailClient from './BatchDetailClient'
import { requireAdminPage } from '@/lib/server-auth'

export default async function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()
  const { id } = await params
  return <BatchDetailClient batchId={id} />
}
