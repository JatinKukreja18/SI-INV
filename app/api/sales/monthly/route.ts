import { NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/server-auth'
import { getSessionDataScope } from '@/lib/data-scope'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const dataScope = getSessionDataScope(session)

  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)

  const { data, error } = await supabaseAdmin
    .from('ledger_entries')
    .select('entry_date, qty, unit_price, unit_cost')
    .eq('data_scope', dataScope)
    .eq('entry_type', 'out')
    .gte('entry_date', from)
    .lte('entry_date', to)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const byDay: Record<string, { revenue: number; cost: number }> = {}
  for (const row of data) {
    const d = row.entry_date as string
    if (!byDay[d]) byDay[d] = { revenue: 0, cost: 0 }
    byDay[d].revenue += (row.qty as number) * (row.unit_price as number)
    byDay[d].cost += (row.qty as number) * (row.unit_cost as number)
  }

  const days = Array.from({ length: now.getDate() }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), i + 1).toISOString().slice(0, 10)
    const label = String(i + 1)
    return {
      date: d,
      day: label,
      revenue: Math.round(byDay[d]?.revenue ?? 0),
      profit: Math.round((byDay[d]?.revenue ?? 0) - (byDay[d]?.cost ?? 0)),
    }
  })

  return NextResponse.json(days)
}
