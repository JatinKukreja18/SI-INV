export type Role = 'admin' | 'staff';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface StockItem {
  id: string;
  item_code: string;
  item_name: string;
  current_qty: number;
  last_price: number;
  ean_code?: string;
  created_at: string;
  updated_at: string;
}

export interface LedgerEntry {
  id: string;
  entry_date: string;
  item_code: string;
  item_name: string;
  entry_type: 'in' | 'out';
  qty: number;
  unit_price: number;
  unit_cost: number;
  balance_after: number;
  upload_batch_id?: string;
  created_by?: string;
  created_at: string;
}

export interface UploadBatch {
  id: string;
  upload_date: string;
  batch_type: 'stock_in' | 'edit_out';
  filename?: string;
  total_items: number;
  uploaded_by?: string;
  duplicate_override: boolean;
  created_at: string;
}

export interface ExcelRow {
  item_code: string;
  item_name: string;
  qty: number;
  unit_price: number;
  unit_cost?: number;
  ean_code?: string;
}

export type BatchItemInput = ExcelRow;

export interface UploadPreviewRow extends ExcelRow {
  current_stock: number;
  stock_after: number;
  warning?: string;
  name_mismatch?: string; // existing DB name when it differs from incoming item_name
}

export interface BatchShortage {
  item_code: string;
  item_name: string;
  requested_qty: number;
  available_qty: number;
  reason: string;
}

export interface PostedBatchItem extends ExcelRow {
  previous_qty: number;
  new_qty: number;
  entry_type: 'in' | 'out';
}

export interface DuplicateBatchInfo {
  batchId: string;
  filename: string;
  uploadDate: string;
}

export interface BatchOperationResult {
  success: boolean;
  batchId?: string;
  savedCount: number;
  errors: string[];
  shortages: BatchShortage[];
  postedItems: PostedBatchItem[];
  duplicate?: DuplicateBatchInfo;
}
