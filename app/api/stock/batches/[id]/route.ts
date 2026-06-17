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

  const { data, error } = await supabaseAdmin.rpc('update_stock_in_batch', {
    p_batch_id: id,
    p_items: parsed.data.items,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const result = data as {
    success?: boolean
    errors?: string[]
    invalidBalances?: Array<Record<string, unknown>>
    updatedCount?: number
  } | null

  if (!result?.success) {
    return NextResponse.json(
      {
        error: result?.errors?.join('; ') ?? 'Batch update failed',
        invalidBalances: result?.invalidBalances ?? [],
      },
      { status: 422 }
    )
  }

  return NextResponse.json({
    success: true,
    updatedCount: result.updatedCount ?? parsed.data.items.length,
  })
}
