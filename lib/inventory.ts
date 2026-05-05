import { z } from 'zod';
import type { BatchItemInput, BatchOperationResult, StockItem, UploadPreviewRow } from '@/types';

type SpreadsheetCell = string | number | boolean | null | undefined;
type SpreadsheetRow = Record<string, SpreadsheetCell>;

export const batchItemSchema = z.object({
  item_code: z.string().trim().min(1),
  item_name: z.string().trim().min(1),
  qty: z.number().positive(),
  unit_price: z.number().min(0),
});

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const stockInPayloadSchema = z.object({
  date: dateSchema,
  items: z.array(batchItemSchema).min(1),
});

export const uploadPayloadSchema = z.object({
  date: dateSchema,
  filename: z.string().trim().min(1),
  items: z.array(batchItemSchema).min(1),
  allowDuplicate: z.boolean().optional().default(false),
});
function normalizeHeader(h: string): string {
  return String(h)
    .toLowerCase()
    .replace(/[\s_.()]/g, '');
}

function getStringCellFuzzy(row: SpreadsheetRow, aliases: string[]): string {
  const normalizedAliases = aliases.map(normalizeHeader);
  for (const key of Object.keys(row)) {
    if (normalizedAliases.includes(normalizeHeader(key))) {
      const value = row[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number' && Number.isFinite(value)) return String(value).trim();
    }
  }
  return '';
}

function getNumberCellFuzzy(row: SpreadsheetRow, aliases: string[]): number {
  const normalizedAliases = aliases.map(normalizeHeader);
  for (const key of Object.keys(row)) {
    if (normalizedAliases.includes(normalizeHeader(key))) {
      const value = row[key];
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value.trim());
        if (Number.isFinite(parsed)) return parsed;
      }
    }
  }
  return 0;
}
export function normalizeSheetRows(rows: SpreadsheetRow[]): BatchItemInput[] {
  const items = new Map<string, BatchItemInput>();

  for (const row of rows) {
    const itemCode = getStringCellFuzzy(row, ['Item Code', 'item_code', 'Code', 'ITEM CODE']);
    const itemName = getStringCellFuzzy(row, ['Name', 'Item Name', 'item_name', 'ITEM NAME']);
    const qty = getNumberCellFuzzy(row, ['Quantity', 'Qty', 'qty', 'QTY']);

    let unitPrice = getNumberCellFuzzy(row, ['Price', 'Unit Price', 'unit_price', 'Rate', 'MRP']);
    if (unitPrice === 0 && qty > 0) {
      const netSales = getNumberCellFuzzy(row, ['NET SALES (WITH TAX)', 'Net Sales', 'Amount', 'Total']);
      if (netSales > 0) unitPrice = Math.round((netSales / qty) * 100) / 100;
    }
    const ean = getStringCellFuzzy(row, ['EAN CODE', 'EAN', 'ean_code', 'Barcode']);

    const unitCost = (() => {
      const netCost = getNumberCellFuzzy(row, ['NET COST (WITH TAX)', 'Net Cost', 'unit_cost', 'Cost']);
      if (netCost > 0 && qty > 0) return Math.round((netCost / qty) * 100) / 100;
      return 0;
    })();

    if (!itemCode || !itemName || qty <= 0) continue;

    const existing = items.get(itemCode);
    if (existing) {
      existing.qty += qty;
      if (unitPrice > 0) existing.unit_price = unitPrice;
      if (unitCost > 0) existing.unit_cost = unitCost;
      if (ean) existing.ean_code = ean;
    } else {
      items.set(itemCode, { item_code: itemCode, item_name: itemName, qty, unit_price: unitPrice, ean_code: ean, unit_cost: unitCost });
    }
  }

  return [...items.values()];
}

export function mergeBatchItems(currentItems: BatchItemInput[], nextItem: BatchItemInput): BatchItemInput[] {
  const items = new Map(currentItems.map((item) => [item.item_code, { ...item }]));
  const existing = items.get(nextItem.item_code);

  if (existing) {
    existing.qty += nextItem.qty;
    existing.item_name = nextItem.item_name;
    if (nextItem.unit_price > 0) {
      existing.unit_price = nextItem.unit_price;
    }
  } else {
    items.set(nextItem.item_code, { ...nextItem });
  }

  return [...items.values()];
}

export function buildUploadPreview(items: BatchItemInput[], stocks: StockItem[]): UploadPreviewRow[] {
  const stockMap = Object.fromEntries(stocks.map((stock) => [stock.item_code, stock]));

  return items.map((item) => {
    const currentStock = stockMap[item.item_code]?.current_qty ?? 0;
    const warning = !stockMap[item.item_code]
      ? 'Not in stock master'
      : currentStock < item.qty
        ? `Only ${currentStock} in stock`
        : undefined;

    return {
      ...item,
      current_stock: currentStock,
      stock_after: Math.max(0, currentStock - item.qty),
      warning,
    };
  });
}

export async function parseBatchResponse(response: Response): Promise<BatchOperationResult> {
  const data = (await response.json()) as Partial<BatchOperationResult>;

  return {
    success: Boolean(data.success),
    batchId: data.batchId,
    savedCount: data.savedCount ?? 0,
    errors: data.errors ?? [],
    shortages: data.shortages ?? [],
    postedItems: data.postedItems ?? [],
    duplicate: data.duplicate,
  };
}

function getStringCell(row: SpreadsheetRow, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value).trim();
    }
  }

  return '';
}

function getNumberCell(row: SpreadsheetRow, keys: string[]): number {
  for (const key of keys) {
    const value = row[key];

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
}
