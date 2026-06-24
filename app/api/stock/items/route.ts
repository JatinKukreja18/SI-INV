import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerAuthSession } from '@/lib/server-auth'
import { getSessionDataScope } from '@/lib/data-scope'
import { supabaseAdmin } from '@/lib/supabase'

export async function DELETE(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const dataScope = getSessionDataScope(session)

  const code = new URL(req.url).searchParams.get('code')
  if (!code) return NextResponse.json({ error: 'Item code required' }, { status: 400 })

  const { count, error: countError } = await supabaseAdmin
    .from('ledger_entries')
    .select('*', { count: 'exact', head: true })
    .eq('data_scope', dataScope)
    .eq('item_code', code)

  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 })

  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: 'Item has transaction history and cannot be deleted' }, { status: 409 })
  }

  const { error } = await supabaseAdmin
    .from('stock_items')
    .delete()
    .eq('data_scope', dataScope)
    .eq('item_code', code)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

const createItemSchema = z.object({
  item_code: z.string().trim().min(1),
  item_name: z.string().trim().min(1),
  ean_code: z.string().trim().optional(),
})

export async function POST(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const dataScope = getSessionDataScope(session)

  const parsed = createItemSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

  const { item_code, item_name, ean_code } = parsed.data

  const { error } = await supabaseAdmin
    .from('stock_items')
    .insert({ data_scope: dataScope, item_code, item_name, ean_code: ean_code || null, current_qty: 0, last_price: 0 })

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Item code already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
