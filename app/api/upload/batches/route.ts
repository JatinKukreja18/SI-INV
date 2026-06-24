import { NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/server-auth'
import { getSessionDataScope } from '@/lib/data-scope'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const session = await getServerAuthSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const dataScope = getSessionDataScope(session)

  const { data, error } = await supabaseAdmin
    .from('upload_batches')
    .select('*, users(name, email)')
    .eq('data_scope', dataScope)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
