import BatchDetailClient from './BatchDetailClient'
import { requireSession } from '@/lib/server-auth'
import { getEffectiveRole } from '@/lib/view-role'

export default async function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  const effectiveRole = await getEffectiveRole(session.user.role)
  const { id } = await params
  return <BatchDetailClient batchId={id} role={effectiveRole} />
}
