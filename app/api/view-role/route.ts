import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerAuthSession } from '@/lib/server-auth'
import { VIEW_ROLE_COOKIE } from '@/lib/view-role-shared'

const schema = z.object({
  role: z.enum(['admin', 'staff']),
})

export async function POST(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json() as unknown
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const response = NextResponse.json({ success: true, role: parsed.data.role })
  response.cookies.set(VIEW_ROLE_COOKIE, parsed.data.role, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })

  return response
}
