import BatchDetailClient from './BatchDetailClient'
import { requireAdminPage } from '@/lib/server-auth'

export default async function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminPage()
  const { id } = await params
  return <BatchDetailClient batchId={id} role={session.user.role} />
}
