import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import type { Session } from 'next-auth'

export async function getServerAuthSession(): Promise<Session | null> {
  return getServerSession(authOptions)
}

export async function requireSession(): Promise<Session> {
  const session = await getServerAuthSession()
  if (!session?.user?.id) {
    redirect('/login')
  }

  return session
}

export async function requireAdminPage(): Promise<Session> {
  const session = await requireSession()

  if (session.user.role !== 'admin') {
    redirect('/dashboard')
  }

  return session
}
