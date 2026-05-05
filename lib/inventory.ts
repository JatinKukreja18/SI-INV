import { z } from 'zod'
import type { BatchItemInput, BatchOperationResult, StockItem, UploadPreviewRow } from '@/types'

type SpreadsheetCell = string | number | boolean | null | undefined
type SpreadsheetRow = Record<string, SpreadsheetCell>

export const batchItemSchema = z.object({
  item_code: z.string().trim().min(1),
  item_name: z.string().trim().min(1),
  qty: z.number().positive(),
  unit_price: z.number().min(0),
})

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const stockInPayloadSchema = z.object({
  date: dateSchema,
  items: z.array(batchItemSchema).min(1),
})

export const uploadPayloadSchema = z.object({
  date: dateSchema,
  filename: z.string().trim().min(1),
  items: z.array(batchItemSchema).min(1),
  allowDuplicate: z.boolean().optional().default(false),
})

export function normalizeSheetRows(rows: SpreadsheetRow[]): BatchItemInput[] {
  const items = new Map<string, BatchItemInput>()

  for (const row of rows) {
    const itemCode = getStringCell(row, ['Item Code', 'item_code', 'Code'])
    const itemName = getStringCell(row, ['Name', 'Item Name', 'item_name'])
    const qty = getNumberCell(row, ['Quantity', 'Qty', 'qty'])
    const unitPrice = getNumberCell(row, ['Price', 'Unit Price', 'unit_price'])

    if (!itemCode || !itemName || qty <= 0) {
      continue
    }

    const existing = items.get(itemCode)
    if (existing) {
      existing.qty += qty
      if (unitPrice > 0) {
        existing.unit_price = unitPrice
      }
    } else {
      items.set(itemCode, {
        item_code: itemCode,
        item_name: itemName,
        qty,
        unit_price: unitPrice,
      })
    }
  }

  return [...items.values()]
}

export function mergeBatchItems(currentItems: BatchItemInput[], nextItem: BatchItemInput): BatchItemInput[] {
  const items = new Map(currentItems.map(item => [item.item_code, { ...item }]))
  const existing = items.get(nextItem.item_code)

  if (existing) {
    existing.qty += nextItem.qty
    existing.item_name = nextItem.item_name
    if (nextItem.unit_price > 0) {
      existing.unit_price = nextItem.unit_price
    }
  } else {
    items.set(nextItem.item_code, { ...nextItem })
  }

  return [...items.values()]
}

export function buildUploadPreview(items: BatchItemInput[], stocks: StockItem[]): UploadPreviewRow[] {
  const stockMap = Object.fromEntries(stocks.map(stock => [stock.item_code, stock]))

  return items.map(item => {
    const currentStock = stockMap[item.item_code]?.current_qty ?? 0
    const warning = !stockMap[item.item_code]
      ? 'Not in stock master'
      : currentStock < item.qty
        ? `Only ${currentStock} in stock`
        : undefined

    return {
      ...item,
      current_stock: currentStock,
      stock_after: Math.max(0, currentStock - item.qty),
      warning,
    }
  })
}

export async function parseBatchResponse(response: Response): Promise<BatchOperationResult> {
  const data = (await response.json()) as Partial<BatchOperationResult>

  return {
    success: Boolean(data.success),
    batchId: data.batchId,
    savedCount: data.savedCount ?? 0,
    errors: data.errors ?? [],
    shortages: data.shortages ?? [],
    postedItems: data.postedItems ?? [],
    duplicate: data.duplicate,
  }
}

function getStringCell(row: SpreadsheetRow, keys: string[]): string {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value).trim()
    }
  }

  return ''
}

function getNumberCell(row: SpreadsheetRow, keys: string[]): number {
  for (const key of keys) {
    const value = row[key]

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }

  return 0
}
