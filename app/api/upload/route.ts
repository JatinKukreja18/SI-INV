import { NextRequest, NextResponse } from 'next/server'
import { uploadPayloadSchema } from '@/lib/inventory'
import { getServerAuthSession } from '@/lib/server-auth'
import { getSessionDataScope } from '@/lib/data-scope'
import { supabaseAdmin } from '@/lib/supabase'
import type { BatchOperationResult } from '@/types'

export async function POST(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const dataScope = getSessionDataScope(session)

  const parsedPayload = uploadPayloadSchema.safeParse(await req.json())
  if (!parsedPayload.success) {
    return NextResponse.json<BatchOperationResult>({
      success: false,
      savedCount: 0,
      errors: ['Invalid upload payload.'],
      shortages: [],
      postedItems: [],
    }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin.rpc('post_inventory_batch', {
    p_data_scope: dataScope,
    p_batch_type: 'edit_out',
    p_entry_date: parsedPayload.data.date,
    p_filename: parsedPayload.data.filename,
    p_items: parsedPayload.data.items,
    p_created_by: session.user.id,
    p_duplicate_override: parsedPayload.data.allowDuplicate,
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
