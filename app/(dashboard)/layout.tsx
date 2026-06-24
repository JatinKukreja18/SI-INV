import { Sidebar } from '@/components/Sidebar'
import { requireSession } from '@/lib/server-auth'
import { getEffectiveRole } from '@/lib/view-role'
import { getSessionDataScope } from '@/lib/data-scope'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()
  const effectiveRole = await getEffectiveRole(session.user.role)
  const dataScope = getSessionDataScope(session)
  const isPreviewingStaff = session.user.role === 'admin' && effectiveRole === 'staff'

  return (
    <div className="flex h-screen bg-[#f8f8f7]">
      <Sidebar actualRole={session.user.role} effectiveRole={effectiveRole} dataScope={dataScope} userName={session.user.name ?? ''} />
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-6">
          {isPreviewingStaff && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Employee preview is on. You are still logged in as admin, but the interface is showing the staff view.
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  )
}
