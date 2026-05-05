'use client'
import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { useQueryClient } from '@tanstack/react-query'
import { ExcelRow } from '@/types'
import { DataTable } from '@/components/ui/DataTable'
import { ColumnDef } from '@tanstack/react-table'

const columns: ColumnDef<ExcelRow, any>[] = [
  { accessorKey: 'item_code', header: 'Code' },
  { accessorKey: 'item_name', header: 'Item Name' },
  { accessorKey: 'qty', header: 'Quantity', cell: ({ getValue }) => (getValue() as number).toLocaleString('en-IN') },
  { accessorKey: 'unit_price', header: 'Unit Price', cell: ({ getValue }) => `₹${(getValue() as number).toFixed(2)}` },
]

export default function StockInPage() {
  const qc = useQueryClient()
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [items, setItems] = useState<ExcelRow[]>([])
  const [form, setForm] = useState({ item_code: '', item_name: '', qty: '', unit_price: '' })
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function addManual() {
    if (!form.item_code || !form.item_name || !form.qty) return
    setItems(prev => [...prev, {
      item_code: form.item_code.trim(),
      item_name: form.item_name.trim(),
      qty: parseFloat(form.qty),
      unit_price: parseFloat(form.unit_price) || 0,
    }])
    setForm({ item_code: '', item_name: '', qty: '', unit_price: '' })
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const wb = XLSX.read(ev.target?.result, { type: 'binary' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as any[]
      const parsed: ExcelRow[] = rows.map(r => ({
        item_code: String(r['Item Code'] || r['item_code'] || r['Code'] || '').trim(),
        item_name: String(r['Name'] || r['Item Name'] || r['item_name'] || '').trim(),
        qty: parseFloat(r['Quantity'] || r['Qty'] || r['qty'] || 0),
        unit_price: parseFloat(r['Price'] || r['Unit Price'] || r['unit_price'] || 0),
      })).filter(r => r.item_code && r.item_name && r.qty > 0)
      setItems(prev => [...prev, ...parsed])
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  async function save() {
    if (!items.length) return
    setSaving(true)
    try {
      const res = await fetch('/api/stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, items }),
      })
      const data = await res.json()
      if (data.success) {
        setMsg({ type: 'success', text: `Saved ${items.length} items successfully.` })
        setItems([])
        qc.invalidateQueries({ queryKey: ['stocks'] })
      } else {
        setMsg({ type: 'error', text: data.errors?.join(', ') || 'Error saving.' })
      }
    } catch {
      setMsg({ type: 'error', text: 'Network error.' })
    }
    setSaving(false)
  }

  return (
    <div>
      <h1 className="text-lg font-medium text-gray-900 mb-5">Stock In</h1>

      <div className="bg-white border border-gray-100 rounded-xl p-5 mb-4">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-4">Entry Details</h2>

        <div className="mb-4">
          <label className="block text-xs text-gray-500 mb-1">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400 w-44" />
        </div>

        <div className="grid grid-cols-4 gap-2 mb-2">
          {(['item_code', 'item_name', 'qty', 'unit_price'] as const).map(k => (
            <div key={k}>
              <label className="block text-xs text-gray-400 mb-1">
                {k === 'item_code' ? 'Item Code' : k === 'item_name' ? 'Item Name' : k === 'qty' ? 'Quantity' : 'Unit Price (₹)'}
              </label>
              <input
                type={k === 'qty' || k === 'unit_price' ? 'number' : 'text'}
                value={form[k]}
                onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && addManual()}
                placeholder={k === 'item_code' ? 'ITM001' : k === 'item_name' ? 'Item name' : k === 'qty' ? '0' : '0.00'}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
              />
            </div>
          ))}
        </div>
        <button onClick={addManual} className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800">
          Add Row
        </button>

        <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-3">
          <button onClick={() => fileRef.current?.click()}
            className="text-sm px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50">
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
          <DataTable data={items} columns={columns} />
          <div className="mt-4 flex items-center gap-3">
            <button onClick={save} disabled={saving}
              className="px-5 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Stock-In'}
            </button>
            {msg && (
              <p className={`text-sm ${msg.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>{msg.text}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
