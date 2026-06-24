import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/server-auth'
import { getSessionDataScope } from '@/lib/data-scope'
import { supabaseAdmin } from '@/lib/supabase'
import type { LedgerEntry } from '@/types'

export async function GET(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const dataScope = getSessionDataScope(session)

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  const code = searchParams.get('code')
  const date = searchParams.get('date')

  let query = supabaseAdmin
    .from('ledger_entries')
    .select('*')
    .eq('data_scope', dataScope)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (type === 'item' && code) {
    query = query.eq('item_code', code)
  } else if (type === 'day' && date) {
    query = query.eq('entry_date', date)
  }

  const { data, error } = await query.limit(500)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data as LedgerEntry[])
}
