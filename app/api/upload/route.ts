import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { date, filename, items } = body as {
    date: string
    filename: string
    items: { item_code: string; item_name: string; qty: number; unit_price: number }[]
  }

  if (!date || !items?.length)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

  // Create upload batch
  const { data: batch, error: batchErr } = await supabaseAdmin
    .from('upload_batches')
    .insert({
      upload_date: date,
      filename,
      total_items: items.length,
      uploaded_by: (session.user as any).id,
    })
    .select()
    .single()

  if (batchErr) return NextResponse.json({ error: batchErr.message }, { status: 500 })

  const errors: string[] = []

  for (const item of items) {
    const { data: existing } = await supabaseAdmin
      .from('stock_items')
      .select('current_qty')
      .eq('item_code', item.item_code)
      .single()

    const currentQty = existing?.current_qty ?? 0
    const newQty = Math.max(0, currentQty - item.qty)

    // Upsert stock item
    await supabaseAdmin
      .from('stock_items')
      .upsert({
        item_code: item.item_code,
        item_name: item.item_name,
        current_qty: newQty,
        last_price: item.unit_price,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'item_code' })

    // Insert ledger entry
    const { error: entryErr } = await supabaseAdmin
      .from('ledger_entries')
      .insert({
        entry_date: date,
        item_code: item.item_code,
        item_name: item.item_name,
        entry_type: 'out',
        qty: item.qty,
        unit_price: item.unit_price,
        balance_after: newQty,
        upload_batch_id: batch.id,
        created_by: (session.user as any).id,
      })

    if (entryErr) errors.push(`${item.item_code}: ${entryErr.message}`)
  }

  return NextResponse.json({ success: true, batchId: batch.id, errors })
}
