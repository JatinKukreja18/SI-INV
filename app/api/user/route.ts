import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getServerAuthSession } from '@/lib/server-auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function PATCH(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, currentPassword, newPassword } = await req.json() as {
    name?: string
    currentPassword?: string
    newPassword?: string
  }

  const { data: user, error: fetchError } = await supabaseAdmin
    .from('users')
    .select('password_hash')
    .eq('id', session.user.id)
    .single()

  if (fetchError || !user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const updates: Record<string, string> = {}

  if (name?.trim()) {
    updates.name = name.trim()
  }

  if (currentPassword && newPassword) {
    const valid = await bcrypt.compare(currentPassword, user.password_hash)
    if (!valid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
    updates.password_hash = await bcrypt.hash(newPassword, 10)
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { error: updateError } = await supabaseAdmin
    .from('users')
    .update(updates)
    .eq('id', session.user.id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ success: true, name: updates.name })
}
