'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { mergeBatchItems, normalizeSheetRows, parseBatchResponse, findHeaderRow } from '@/lib/inventory';
import type { BatchItemInput, BatchOperationResult, StockItem } from '@/types';
import { toast } from 'sonner';
import { AddItemDialog } from '@/components/ui/AddItemDialog';
import type { AddItemFormValues } from '@/components/ui/AddItemDialog';

export default function StockInClient() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [items, setItems] = useState<BatchItemInput[]>([]);
  const [result, setResult] = useState<BatchOperationResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [nameResolutions, setNameResolutions] = useState<Record<string, 'incoming' | 'existing'>>({});
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDefaults, setDialogDefaults] = useState<Partial<AddItemFormValues>>({});

  const { data: stocks = [] } = useQuery<StockItem[]>({
    queryKey: ['stocks'],
    queryFn: async () => {
      const response = await fetch('/api/stock');
      return response.json() as Promise<StockItem[]>;
    },
  });

  const stockMap = Object.fromEntries(stocks.map((s) => [s.item_code, s]));
  const nameMismatches = items.filter((item) => {
    const existing = stockMap[item.item_code];
    return existing && existing.item_name !== item.item_name;
  });

  const query = search.trim().toLowerCase();
  const filtered = query.length < 1 ? [] : stocks.filter(s =>
    s.item_code.toLowerCase().includes(query) ||
    (s.ean_code ?? '').toLowerCase().includes(query) ||
    s.item_name.toLowerCase().includes(query)
  ).slice(0, 8);

  const exactMatch = stocks.find(s =>
    s.item_code.toLowerCase() === query ||
    (s.ean_code ?? '').toLowerCase() === query
  );
  const showAddNew = query.length > 0 && !exactMatch;

  function selectStock(stock: StockItem) {
    const next: BatchItemInput = {
      item_code: stock.item_code,
      item_name: stock.item_name,
      qty: 1,
      unit_price: stock.last_price,
    };
    setItems(prev => mergeBatchItems(prev, next));
    setSearch('');
    setOpen(false);
  }

  function openAddNewDialog() {
    const term = search.trim();
    const isEan = /^\d{8,14}$/.test(term);
    const isNumeric = /^\d+$/.test(term);
    const defaults = isEan ? { ean_code: term } : isNumeric ? { item_code: term } : { item_name: term };
    setDialogDefaults(defaults);
    setOpen(false);
    setDialogOpen(true);
  }

  function handleDialogConfirm(values: AddItemFormValues) {
    const next: BatchItemInput = {
      item_code: values.item_code,
      item_name: values.item_name,
      qty: values.qty,
      unit_price: values.unit_price,
      ean_code: values.ean_code || undefined,
    };
    setItems(prev => mergeBatchItems(prev, next));
    setSearch('');
    setDialogOpen(false);
  }

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const workbook = XLSX.read(loadEvent.target?.result, { type: 'binary', cellDates: true });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1, defval: '' }) as string[][];
      const headerRowIndex = findHeaderRow(rawRows);
      const sheetRange = XLSX.utils.decode_range(worksheet['!ref'] ?? 'A1');
      const rows = XLSX.utils.sheet_to_json<Record<string, string | number | boolean | null>>(worksheet, { defval: '', range: sheetRange.s.r + headerRowIndex });
      const parsedItems = normalizeSheetRows(rows);
      setItems(prev => {
        let merged = prev;
        for (const item of parsedItems) merged = mergeBatchItems(merged, item);
        return merged;
      });
    };
    reader.readAsBinaryString(file);
    event.target.value = '';
  }

  async function save() {
    if (!items.length) return;
    setSaving(true);
    setResult(null);
    try {
      const resolvedItems = items.map((item) => {
        const existing = stockMap[item.item_code];
        if (existing && existing.item_name !== item.item_name && nameResolutions[item.item_code] === 'existing') {
          return { ...item, item_name: existing.item_name };
        }
        return item;
      });
      const response = await fetch('/api/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, items: resolvedItems }),
      });
      const data = await parseBatchResponse(response);
      setResult(data);
      if (data.success) {
        toast.success(`${data.savedCount} items posted to stock`);
        setItems([]);
        setNameResolutions({});
        queryClient.invalidateQueries({ queryKey: ['stocks'] });
      } else {
        toast.error(data.errors[0] || 'Stock-in failed');
      }
    } catch {
      toast.error('Network error — please try again.');
      setResult({ success: false, savedCount: 0, errors: ['Network error.'], shortages: [], postedItems: [] });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-medium text-gray-900">Stock In</h1>
        <Link href="/stock-in/history" className="text-xs text-gray-400 hover:text-gray-600">
          View history →
        </Link>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-5 mb-4">
        <div className="flex items-end gap-4 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400 w-44"
            />
          </div>
          <div className="flex-1 relative">
            <label className="block text-xs text-gray-500 mb-1">Search item by code, EAN or name</label>
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              onKeyDown={(e) => { if (e.key === 'Enter' && filtered.length === 1) selectStock(filtered[0]); if (e.key === 'Escape') setOpen(false); }}
              placeholder="Type item code, EAN or name…"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
            />
            {open && (filtered.length > 0 || showAddNew) && (
              <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                {filtered.map(stock => (
                  <button
                    key={stock.item_code}
                    onMouseDown={() => selectStock(stock)}
                    className="w-full text-left px-3 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                  >
                    <span className="text-xs text-gray-400 mr-2">{stock.item_code}</span>
                    <span className="text-sm text-gray-900">{stock.item_name}</span>
                    {stock.ean_code && <span className="text-xs text-gray-400 ml-2">· {stock.ean_code}</span>}
                    <span className="float-right text-xs text-gray-400">Stock: {stock.current_qty}</span>
                  </button>
                ))}
                {showAddNew && (
                  <button
                    onMouseDown={openAddNewDialog}
                    className="w-full text-left px-3 py-2.5 hover:bg-gray-50 text-sm text-blue-600"
                  >
                    + Add &ldquo;{search.trim()}&rdquo; as new item
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-gray-100 pt-3 flex items-center gap-3">
          <button onClick={() => fileRef.current?.click()} className="text-sm px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50">
            Upload Excel
          </button>
          <span className="text-xs text-gray-400">Columns: Item Code, Name, Quantity, Price</span>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
        </div>
      </div>

      {items.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wide">Items to Add ({items.length})</h2>
            <button onClick={() => setItems([])} className="text-xs text-red-500 hover:text-red-700">Clear all</button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs text-gray-400 font-medium pb-2 pr-3">Code</th>
                  <th className="text-left text-xs text-gray-400 font-medium pb-2 pr-3">Item Name</th>
                  <th className="text-left text-xs text-gray-400 font-medium pb-2 pr-3 w-24">Qty</th>
                  <th className="text-left text-xs text-gray-400 font-medium pb-2 pr-3 w-28">Unit Price (₹)</th>
                  <th className="pb-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.item_code} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-1.5 pr-3 text-gray-500 text-xs">{item.item_code}</td>
                    <td className="py-1.5 pr-3">
                      <input
                        value={item.item_name}
                        onChange={(e) => setItems(prev => prev.map(r => r.item_code === item.item_code ? { ...r, item_name: e.target.value } : r))}
                        className="w-full px-2 py-1 border border-transparent hover:border-gray-200 focus:border-gray-400 rounded text-sm focus:outline-none"
                      />
                    </td>
                    <td className="py-1.5 pr-3">
                      <input
                        type="number"
                        value={item.qty}
                        onChange={(e) => setItems(prev => prev.map(r => r.item_code === item.item_code ? { ...r, qty: Number(e.target.value) } : r))}
                        className="w-full px-2 py-1 border border-transparent hover:border-gray-200 focus:border-gray-400 rounded text-sm focus:outline-none"
                      />
                    </td>
                    <td className="py-1.5 pr-3">
                      <input
                        type="number"
                        value={item.unit_price}
                        onChange={(e) => setItems(prev => prev.map(r => r.item_code === item.item_code ? { ...r, unit_price: Number(e.target.value) } : r))}
                        className="w-full px-2 py-1 border border-transparent hover:border-gray-200 focus:border-gray-400 rounded text-sm focus:outline-none"
                      />
                    </td>
                    <td className="py-1.5">
                      <button onClick={() => setItems(prev => prev.filter(r => r.item_code !== item.item_code))} className="text-gray-300 hover:text-red-500 text-xs px-1">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {nameMismatches.length > 0 && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-xs font-medium text-yellow-800 mb-2">
                {nameMismatches.length} item name conflict{nameMismatches.length > 1 ? 's' : ''} — choose which name to keep
              </p>
              <div className="space-y-2">
                {nameMismatches.map((item) => {
                  const existingName = stockMap[item.item_code]?.item_name ?? '';
                  const choice = nameResolutions[item.item_code] ?? 'incoming';
                  return (
                    <div key={item.item_code} className="text-xs bg-white border border-yellow-100 rounded-lg p-2.5">
                      <p className="text-gray-400 mb-1.5">{item.item_code}</p>
                      <div className="flex gap-3">
                        <label className={`flex-1 flex items-start gap-2 cursor-pointer rounded p-2 border ${choice === 'incoming' ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200'}`}>
                          <input type="radio" name={`name-${item.item_code}`} checked={choice === 'incoming'} onChange={() => setNameResolutions(prev => ({ ...prev, [item.item_code]: 'incoming' }))} className="mt-0.5 shrink-0" />
                          <span><span className="block font-medium text-gray-700">{item.item_name}</span><span className="text-gray-400">From entry</span></span>
                        </label>
                        <label className={`flex-1 flex items-start gap-2 cursor-pointer rounded p-2 border ${choice === 'existing' ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200'}`}>
                          <input type="radio" name={`name-${item.item_code}`} checked={choice === 'existing'} onChange={() => setNameResolutions(prev => ({ ...prev, [item.item_code]: 'existing' }))} className="mt-0.5 shrink-0" />
                          <span><span className="block font-medium text-gray-700">{existingName}</span><span className="text-gray-400">In stock master</span></span>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button onClick={save} disabled={saving} className="px-5 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Stock-In'}
            </button>
          </div>
        </div>
      )}

      {result && !result.success && (
        <div className="border rounded-xl p-5 bg-red-50 border-red-200">
          <p className="text-sm font-medium text-red-800 mb-1">Batch could not be posted</p>
          <p className="text-sm text-red-700">{result.errors[0] ?? 'Please review and try again.'}</p>
        </div>
      )}

      <AddItemDialog
        open={dialogOpen}
        defaultValues={dialogDefaults}
        showStockFields
        onClose={() => setDialogOpen(false)}
        onConfirm={handleDialogConfirm}
      />
    </div>
  );
}
