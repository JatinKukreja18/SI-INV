import { NextRequest, NextResponse } from 'next/server'
import { stockInPayloadSchema } from '@/lib/inventory'
import { getServerAuthSession } from '@/lib/server-auth'
import { getSessionDataScope } from '@/lib/data-scope'
import { supabaseAdmin } from '@/lib/supabase'
import type { BatchOperationResult, StockItem } from '@/types'

export async function GET() {
  const session = await getServerAuthSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const dataScope = getSessionDataScope(session)

  const { data, error } = await supabaseAdmin
    .from('stock_items')
    .select('*')
    .eq('data_scope', dataScope)
    .order('item_name')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data as StockItem[])
}

export async function POST(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const dataScope = getSessionDataScope(session)

  const parsedPayload = stockInPayloadSchema.safeParse(await req.json())
  if (!parsedPayload.success) {
    return NextResponse.json<BatchOperationResult>({
      success: false,
      savedCount: 0,
      errors: ['Invalid stock-in payload.'],
      shortages: [],
      postedItems: [],
    }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin.rpc('post_inventory_batch', {
    p_data_scope: dataScope,
    p_batch_type: 'stock_in',
    p_entry_date: parsedPayload.data.date,
    p_filename: null,
    p_items: parsedPayload.data.items,
    p_created_by: session.user.id,
    p_duplicate_override: false,
  })

  if (error) {
    return NextResponse.json<BatchOperationResult>({
      success: false,
      savedCount: 0,
      errors: [error.message],
      shortages: [],
      postedItems: [],
    }, { status: 500 })
  }

  const result = data as BatchOperationResult
  return NextResponse.json(result, { status: result.success ? 200 : 409 })
}
