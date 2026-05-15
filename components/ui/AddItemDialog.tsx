'use client';

import { useState, useEffect } from 'react';

export interface AddItemFormValues {
  item_code: string;
  item_name: string;
  ean_code: string;
  qty: number;
  unit_price: number;
}

interface AddItemDialogProps {
  open: boolean;
  defaultValues?: Partial<AddItemFormValues>;
  showStockFields?: boolean;
  onClose: () => void;
  onConfirm: (values: AddItemFormValues) => void;
}

const empty: AddItemFormValues = { item_code: '', item_name: '', ean_code: '', qty: 1, unit_price: 0 };

export function AddItemDialog({ open, defaultValues, showStockFields = true, onClose, onConfirm }: AddItemDialogProps) {
  const [form, setForm] = useState<AddItemFormValues>({ ...empty, ...defaultValues });

  useEffect(() => {
    if (open) setForm({ ...empty, ...defaultValues });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  function set<K extends keyof AddItemFormValues>(k: K, v: AddItemFormValues[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.item_code.trim() || !form.item_name.trim()) return;
    onConfirm({ ...form, item_code: form.item_code.trim(), item_name: form.item_name.trim(), ean_code: form.ean_code.trim() });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
        <h2 className="text-base font-medium text-gray-900 mb-4">Add New Item</h2>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Item Code *</label>
            <input
              value={form.item_code}
              onChange={e => set('item_code', e.target.value)}
              placeholder="e.g. ITEM001"
              required
              autoFocus
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Item Name *</label>
            <input
              value={form.item_name}
              onChange={e => set('item_name', e.target.value)}
              placeholder="e.g. Basmati Rice 1kg"
              required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">EAN Code</label>
            <input
              value={form.ean_code}
              onChange={e => set('ean_code', e.target.value)}
              placeholder="Barcode (optional)"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
            />
          </div>
          {showStockFields && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Quantity *</label>
                <input
                  type="number"
                  value={form.qty}
                  onChange={e => set('qty', Number(e.target.value))}
                  min={1}
                  required
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Unit Price (₹)</label>
                <input
                  type="number"
                  value={form.unit_price}
                  onChange={e => set('unit_price', Number(e.target.value))}
                  min={0}
                  step="0.01"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
                />
              </div>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800"
            >
              Add Item
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
