import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('stock_items')
    .select('*')
    .order('item_name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if ((session.user as any).role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { date, items } = body as { date: string; items: { item_code: string; item_name: string; qty: number; unit_price: number }[] }

  if (!date || !items?.length)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

  const errors: string[] = []
  const results = []

  for (const item of items) {
    // Upsert stock item
    const { data: existing } = await supabaseAdmin
      .from('stock_items')
      .select('current_qty')
      .eq('item_code', item.item_code)
      .single()

    const newQty = (existing?.current_qty ?? 0) + item.qty

    const { error: upsertErr } = await supabaseAdmin
      .from('stock_items')
      .upsert({
        item_code: item.item_code,
        item_name: item.item_name,
        current_qty: newQty,
        last_price: item.unit_price,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'item_code' })

    if (upsertErr) { errors.push(`${item.item_code}: ${upsertErr.message}`); continue }

    // Insert ledger entry
    const { data: entry } = await supabaseAdmin
      .from('ledger_entries')
      .insert({
        entry_date: date,
        item_code: item.item_code,
        item_name: item.item_name,
        entry_type: 'in',
        qty: item.qty,
        unit_price: item.unit_price,
        balance_after: newQty,
        created_by: (session.user as any).id,
      })
      .select()
      .single()

    results.push(entry)
  }

  if (errors.length) return NextResponse.json({ errors }, { status: 207 })
  return NextResponse.json({ success: true, count: results.length })
}
