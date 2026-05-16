import BatchDetailClient from './BatchDetailClient'
import { requireSession } from '@/lib/server-auth'

export default async function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  const { id } = await params
  return <BatchDetailClient batchId={id} role={session.user.role} />
}
