import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/server-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { z } from 'zod'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data, error } = await supabaseAdmin
    .from('ledger_entries')
    .select('*')
    .eq('upload_batch_id', id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

const patchSchema = z.object({
  items: z.array(z.object({
    entry_id: z.string().uuid(),
    qty: z.number().positive(),
    unit_price: z.number().min(0),
    item_name: z.string().trim().min(1),
  })).min(1),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json() as unknown
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const errors: string[] = []

  for (const item of parsed.data.items) {
    const { data: entry, error: entryErr } = await supabaseAdmin
      .from('ledger_entries')
      .select('qty, item_code, item_name, unit_price')
      .eq('id', item.entry_id)
      .eq('upload_batch_id', id)
      .single()

    if (entryErr || !entry) { errors.push(`Entry ${item.entry_id} not found`); continue }

    const oldQty = entry.qty as number
    const qtyDelta = item.qty - oldQty

    const { data: stockItem, error: stockErr } = await supabaseAdmin
      .from('stock_items')
      .select('current_qty')
      .eq('item_code', entry.item_code as string)
      .single()

    if (stockErr || !stockItem) { errors.push(`Stock item ${entry.item_code} not found`); continue }

    const newCurrentQty = (stockItem.current_qty as number) + qtyDelta
    if (newCurrentQty < 0) {
      errors.push(`Cannot reduce "${entry.item_name}": current stock is ${stockItem.current_qty}, this change would result in ${newCurrentQty}`)
      continue
    }

    const { error: updateEntryErr } = await supabaseAdmin
      .from('ledger_entries')
      .update({ qty: item.qty, unit_price: item.unit_price, item_name: item.item_name })
      .eq('id', item.entry_id)

    if (updateEntryErr) { errors.push(`Failed to update ${entry.item_name}`); continue }

    const stockUpdates: Record<string, unknown> = { current_qty: newCurrentQty }
    if (item.item_name !== (entry.item_name as string)) stockUpdates.item_name = item.item_name

    await supabaseAdmin
      .from('stock_items')
      .update(stockUpdates)
      .eq('item_code', entry.item_code as string)
  }

  if (errors.length > 0) return NextResponse.json({ error: errors.join('; ') }, { status: 422 })
  return NextResponse.json({ success: true })
}
