import { Sidebar } from '@/components/Sidebar'
import { requireSession } from '@/lib/server-auth'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()

  return (
    <div className="flex h-screen bg-[#f8f8f7]">
      <Sidebar role={session.user.role} userName={session.user.name ?? ''} />
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
