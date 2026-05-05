'use client'

import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { useQueryClient } from '@tanstack/react-query'
import { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/DataTable'
import { mergeBatchItems, normalizeSheetRows, parseBatchResponse } from '@/lib/inventory'
import type { BatchItemInput, BatchOperationResult } from '@/types'

const columns: ColumnDef<BatchItemInput, unknown>[] = [
  { accessorKey: 'item_code', header: 'Code' },
  { accessorKey: 'item_name', header: 'Item Name' },
  { accessorKey: 'qty', header: 'Quantity', cell: ({ getValue }) => (getValue() as number).toLocaleString('en-IN') },
  { accessorKey: 'unit_price', header: 'Unit Price', cell: ({ getValue }) => `₹${(getValue() as number).toFixed(2)}` },
]

export default function StockInClient() {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [items, setItems] = useState<BatchItemInput[]>([])
  const [form, setForm] = useState({ item_code: '', item_name: '', qty: '', unit_price: '' })
  const [result, setResult] = useState<BatchOperationResult | null>(null)
  const [saving, setSaving] = useState(false)

  function addManual() {
    if (!form.item_code.trim() || !form.item_name.trim() || !form.qty.trim()) {
      return
    }

    const nextItem: BatchItemInput = {
      item_code: form.item_code.trim(),
      item_name: form.item_name.trim(),
      qty: Number(form.qty),
      unit_price: Number(form.unit_price) || 0,
    }

    if (nextItem.qty <= 0) {
      return
    }

    setItems(currentItems => mergeBatchItems(currentItems, nextItem))
    setForm({ item_code: '', item_name: '', qty: '', unit_price: '' })
  }

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const reader = new FileReader()
    reader.onload = loadEvent => {
      const workbook = XLSX.read(loadEvent.target?.result, { type: 'binary' })
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, string | number | boolean | null>>(worksheet, { defval: '' })
      const parsedItems = normalizeSheetRows(rows)

      setItems(currentItems => {
        let mergedItems = currentItems
        for (const item of parsedItems) {
          mergedItems = mergeBatchItems(mergedItems, item)
        }
        return mergedItems
      })
    }

    reader.readAsBinaryString(file)
    event.target.value = ''
  }

  async function save() {
    if (!items.length) {
      return
    }

    setSaving(true)
    setResult(null)

    try {
      const response = await fetch('/api/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, items }),
      })

      const data = await parseBatchResponse(response)
      setResult(data)

      if (data.success) {
        setItems([])
        queryClient.invalidateQueries({ queryKey: ['stocks'] })
      }
    } catch {
      setResult({
        success: false,
        savedCount: 0,
        errors: ['Network error.'],
        shortages: [],
        postedItems: [],
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h1 className="text-lg font-medium text-gray-900 mb-5">Stock In</h1>

      <div className="bg-white border border-gray-100 rounded-xl p-5 mb-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-4">Entry Details</h2>

        <div className="mb-4">
          <label className="block text-xs text-gray-500 mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={event => setDate(event.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400 w-44"
          />
        </div>

        <div className="grid grid-cols-4 gap-2 mb-2">
          {(['item_code', 'item_name', 'qty', 'unit_price'] as const).map(key => (
            <div key={key}>
              <label className="block text-xs text-gray-400 mb-1">
                {key === 'item_code' ? 'Item Code' : key === 'item_name' ? 'Item Name' : key === 'qty' ? 'Quantity' : 'Unit Price (₹)'}
              </label>
              <input
                type={key === 'qty' || key === 'unit_price' ? 'number' : 'text'}
                value={form[key]}
                onChange={event => setForm(currentForm => ({ ...currentForm, [key]: event.target.value }))}
                onKeyDown={event => event.key === 'Enter' && addManual()}
                placeholder={key === 'item_code' ? 'ITM001' : key === 'item_name' ? 'Item name' : key === 'qty' ? '0' : '0.00'}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
              />
            </div>
          ))}
        </div>

        <button onClick={addManual} className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800">
          Add Row
        </button>

        <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-3">
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
            <button onClick={() => setItems([])} className="text-xs text-red-500 hover:text-red-700">
              Clear all
            </button>
          </div>

          <DataTable data={items} columns={columns} />

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="px-5 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Stock-In'}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className={`border rounded-xl p-5 ${result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <h2 className={`text-sm font-medium mb-2 ${result.success ? 'text-green-800' : 'text-red-800'}`}>
            {result.success ? 'Batch posted successfully' : 'Batch could not be posted'}
          </h2>
          <p className={`text-sm ${result.success ? 'text-green-700' : 'text-red-700'}`}>
            {result.success ? `${result.savedCount} item(s) posted.` : result.errors[0] ?? 'Please review the batch and try again.'}
          </p>
        </div>
      )}
    </div>
  )
}
