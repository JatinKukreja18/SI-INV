'use client';

import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/DataTable';
import { buildUploadPreview, findHeaderRow, normalizeSheetRows, parseBatchResponse } from '@/lib/inventory';
import type { BatchOperationResult, PostedBatchItem, StockItem, UploadPreviewRow } from '@/types';
import { toast } from 'sonner';

const confirmColumns: ColumnDef<UploadPreviewRow, unknown>[] = [
  { accessorKey: 'item_code', header: 'Code' },
  { accessorKey: 'item_name', header: 'Item Name' },
  { accessorKey: 'qty', header: 'Sale Qty', cell: ({ getValue }) => (getValue() as number).toLocaleString('en-IN') },
  { accessorKey: 'unit_price', header: 'Price', cell: ({ getValue }) => `₹${(getValue() as number).toFixed(2)}` },
  { accessorKey: 'current_stock', header: 'Current Stock', cell: ({ getValue }) => (getValue() as number).toLocaleString('en-IN') },
  {
    accessorKey: 'stock_after',
    header: 'After',
    cell: ({ row, getValue }) => {
      const value = getValue() as number;
      return <span className={row.original.warning ? 'text-red-600 font-medium' : 'font-medium'}>{value.toLocaleString('en-IN')}</span>;
    },
  },
  {
    accessorKey: 'warning',
    header: 'Note',
    cell: ({ getValue }) => {
      const value = getValue() as string | undefined;
      return value ? <span className="text-xs text-amber-600">{value}</span> : <span className="text-xs text-green-500">✓</span>;
    },
  },
];

const postedColumns: ColumnDef<PostedBatchItem, unknown>[] = [
  { accessorKey: 'item_code', header: 'Code' },
  { accessorKey: 'item_name', header: 'Item Name' },
  { accessorKey: 'qty', header: 'Qty', cell: ({ getValue }) => (getValue() as number).toLocaleString('en-IN') },
  { accessorKey: 'previous_qty', header: 'Before', cell: ({ getValue }) => (getValue() as number).toLocaleString('en-IN') },
  { accessorKey: 'new_qty', header: 'After', cell: ({ getValue }) => (getValue() as number).toLocaleString('en-IN') },
];

export default function UploadPage() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [filename, setFilename] = useState('');
  const [step, setStep] = useState<'pick' | 'confirm' | 'done'>('pick');
  const [preview, setPreview] = useState<UploadPreviewRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<BatchOperationResult | null>(null);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  // item_code → chosen name ('incoming' keeps file name, 'existing' keeps DB name)
  const [nameResolutions, setNameResolutions] = useState<Record<string, 'incoming' | 'existing'>>({});

  const { data: stocks = [] } = useQuery<StockItem[]>({
    queryKey: ['stocks'],
    queryFn: async () => {
      const response = await fetch('/api/stock');
      return response.json() as Promise<StockItem[]>;
    },
  });

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setFilename(file.name);
    setError('');
    setResult(null);
    setAllowDuplicate(false);
    setNameResolutions({});

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const workbook = XLSX.read(loadEvent.target?.result, { type: 'binary', cellDates: true });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];

      const rawRows = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1, defval: '' }) as string[][];
      const headerRowIndex = findHeaderRow(rawRows);
      const sheetRange = XLSX.utils.decode_range(worksheet['!ref'] ?? 'A1');

      const rows = XLSX.utils.sheet_to_json<Record<string, string | number | boolean | null>>(worksheet, {
        defval: '',
        range: sheetRange.s.r + headerRowIndex,
      });

      const parsedRows = normalizeSheetRows(rows);
      if (parsedRows.length === 0) {
        setError('No valid rows found. Check your file has Item Code, Item Name and Qty columns.');
        return;
      }

      setPreview(buildUploadPreview(parsedRows, stocks));
      setStep('confirm');
    };

    reader.readAsBinaryString(file);
    event.target.value = '';
  }

  async function confirm() {
    setSaving(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          filename,
          allowDuplicate,
          items: preview.map((row) => ({
            item_code: row.item_code,
            item_name:
              row.name_mismatch && nameResolutions[row.item_code] === 'existing'
                ? row.name_mismatch
                : row.item_name,
            qty: row.qty,
            unit_price: row.unit_price,
            unit_cost: row.unit_cost ?? 0,
          })),
        }),
      });

      const data = await parseBatchResponse(response);
      setResult(data);

      if (data.success) {
        toast.success(`${data.savedCount} items saved successfully`);
        queryClient.invalidateQueries({ queryKey: ['stocks'] });
        setStep('done');
      } else {
        const msg = data.errors[0] || 'Upload failed';
        setError(msg);
        toast.error(msg);
      }
    } catch {
      setError('Network error.');
      toast.error('Network error — please try again.');
    } finally {
      setSaving(false);
    }
  }

  const warnings = preview.filter((row) => row.warning);
  const hasBlockingWarnings = warnings.length > 0;
  const nameMismatches = preview.filter((row) => row.name_mismatch);

  return (
    <div>
      <h1 className="text-lg font-medium text-gray-900 mb-5">Upload Sales</h1>

      {step === 'pick' && (
        <div className="bg-white border border-gray-100 rounded-xl p-5">
          <p className="text-sm text-gray-500 mb-4">Upload the daily Excel of items edited out at end of day. These will reduce stock.</p>
          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400 w-44"
            />
          </div>
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center cursor-pointer hover:border-gray-300 hover:bg-gray-50 transition-colors"
          >
            <p className="text-2xl mb-2">📤</p>
            <p className="text-sm text-gray-500">Click to select Excel file</p>
            <p className="text-xs text-gray-400 mt-1">Columns: Item Code, Name, Quantity, Price</p>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
        </div>
      )}

      {step === 'confirm' && (
        <div className="bg-white border border-gray-100 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-medium text-gray-900">Confirm Upload</h2>
              <p className="text-xs text-gray-400">
                {filename} · {preview.length} items · {date}
              </p>
            </div>
            <button onClick={() => setStep('pick')} className="text-xs text-gray-400 hover:text-gray-600">
              ← Back
            </button>
          </div>

          {warnings.length > 0 && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs font-medium text-amber-700 mb-1">{warnings.length} blocking issue(s)</p>
              {warnings.slice(0, 3).map((warning) => (
                <p key={warning.item_code} className="text-xs text-amber-600">
                  • {warning.item_code} ({warning.item_name}): {warning.warning}
                </p>
              ))}
              {warnings.length > 3 && <p className="text-xs text-amber-600">...and {warnings.length - 3} more</p>}
              <p className="text-xs text-amber-700 mt-2">This batch cannot be posted until the stock issues are resolved.</p>
            </div>
          )}

          {result?.duplicate && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs font-medium text-blue-700 mb-1">Possible duplicate upload</p>
              <p className="text-xs text-blue-600">
                A batch with the same filename and date already exists for {result.duplicate.uploadDate}. Tick the override if this upload
                is intentional.
              </p>
              <label className="mt-3 flex items-center gap-2 text-xs text-blue-700">
                <input type="checkbox" checked={allowDuplicate} onChange={(event) => setAllowDuplicate(event.target.checked)} />
                Allow duplicate upload for this file/date
              </label>
            </div>
          )}

          {nameMismatches.length > 0 && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-xs font-medium text-yellow-800 mb-2">
                {nameMismatches.length} item name conflict{nameMismatches.length > 1 ? 's' : ''} — choose which name to keep
              </p>
              <div className="space-y-2">
                {nameMismatches.map((row) => {
                  const choice = nameResolutions[row.item_code] ?? 'incoming';
                  return (
                    <div key={row.item_code} className="text-xs bg-white border border-yellow-100 rounded-lg p-2.5">
                      <p className="text-gray-400 mb-1.5">{row.item_code}</p>
                      <div className="flex gap-3">
                        <label className={`flex-1 flex items-start gap-2 cursor-pointer rounded p-2 border ${choice === 'incoming' ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200'}`}>
                          <input
                            type="radio"
                            name={`name-${row.item_code}`}
                            checked={choice === 'incoming'}
                            onChange={() => setNameResolutions((prev) => ({ ...prev, [row.item_code]: 'incoming' }))}
                            className="mt-0.5 shrink-0"
                          />
                          <span>
                            <span className="block font-medium text-gray-700">{row.item_name}</span>
                            <span className="text-gray-400">From file</span>
                          </span>
                        </label>
                        <label className={`flex-1 flex items-start gap-2 cursor-pointer rounded p-2 border ${choice === 'existing' ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200'}`}>
                          <input
                            type="radio"
                            name={`name-${row.item_code}`}
                            checked={choice === 'existing'}
                            onChange={() => setNameResolutions((prev) => ({ ...prev, [row.item_code]: 'existing' }))}
                            className="mt-0.5 shrink-0"
                          />
                          <span>
                            <span className="block font-medium text-gray-700">{row.name_mismatch}</span>
                            <span className="text-gray-400">In stock master</span>
                          </span>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <DataTable data={preview} columns={confirmColumns} />

          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

          {result && !result.success && result.shortages.length > 0 && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs font-medium text-red-700 mb-2">Shortage details</p>
              {result.shortages.map((shortage) => (
                <p key={shortage.item_code} className="text-xs text-red-600">
                  • {shortage.item_code} ({shortage.item_name}): requested {shortage.requested_qty}, available {shortage.available_qty}
                </p>
              ))}
            </div>
          )}

          <div className="mt-4 flex gap-3">
            <button
              onClick={confirm}
              disabled={saving || hasBlockingWarnings || Boolean(result?.duplicate && !allowDuplicate)}
              className="px-5 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Confirm & Save'}
            </button>
            <button onClick={() => setStep('pick')} className="px-4 py-2 border border-gray-200 text-sm rounded-lg hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="bg-white border border-gray-100 rounded-xl p-5">
          <div className="text-center py-8">
            <p className="text-4xl mb-3">✓</p>
            <h2 className="text-sm font-medium text-gray-900 mb-1">Upload saved successfully</h2>
            <p className="text-xs text-gray-400 mb-5">
              {result?.savedCount ?? preview.length} items processed · {date}
            </p>
          </div>

          {result && (
            <div className="mb-5">
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">Saved Rows</p>
                  <p className="text-xl font-medium">{result.savedCount}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">Errors</p>
                  <p className="text-xl font-medium">{result.errors.length}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-1">Shortages</p>
                  <p className="text-xl font-medium">{result.shortages.length}</p>
                </div>
              </div>

              <DataTable data={result.postedItems} columns={postedColumns} />
            </div>
          )}

          <div className="text-center">
            <button
              onClick={() => {
                setStep('pick');
                setPreview([]);
                setFilename('');
                setResult(null);
                setAllowDuplicate(false);
                setNameResolutions({});
              }}
              className="px-5 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800"
            >
              Upload Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
