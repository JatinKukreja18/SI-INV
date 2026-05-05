'use client'
import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ExcelRow, StockItem, UploadPreviewRow } from '@/types'
import { DataTable } from '@/components/ui/DataTable'
import { ColumnDef } from '@tanstack/react-table'

export default function UploadPage() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [filename, setFilename] = useState('')
  const [step, setStep] = useState<'pick' | 'confirm' | 'done'>('pick')
  const [preview, setPreview] = useState<UploadPreviewRow[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const { data: stocks = [] } = useQuery<StockItem[]>({
    queryKey: ['stocks'],
    queryFn: () => fetch('/api/stock').then(r => r.json()),
  })

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFilename(file.name)
    const reader = new FileReader()
    reader.onload = ev => {
      const wb = XLSX.read(ev.target?.result, { type: 'binary' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as any[]
      const stockMap = Object.fromEntries(stocks.map(s => [s.item_code, s]))

      const parsed: UploadPreviewRow[] = rows.map(r => {
        const code = String(r['Item Code'] || r['item_code'] || r['Code'] || '').trim()
        const name = String(r['Name'] || r['Item Name'] || r['item_name'] || '').trim()
        const qty = parseFloat(r['Quantity'] || r['Qty'] || r['qty'] || 0)
        const price = parseFloat(r['Price'] || r['Unit Price'] || r['unit_price'] || 0)
        const current = stockMap[code]?.current_qty ?? 0
        const after = Math.max(0, current - qty)
        const warning = !stockMap[code]
          ? 'Not in stock master'
          : current < qty
          ? `Only ${current} in stock`
          : undefined
        return { item_code: code, item_name: name, qty, unit_price: price, current_stock: current, stock_after: after, warning }
      }).filter(r => r.item_code && r.item_name && r.qty > 0)

      setPreview(parsed)
      setStep('confirm')
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  async function confirm() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          filename,
          items: preview.map(r => ({
            item_code: r.item_code,
            item_name: r.item_name,
            qty: r.qty,
            unit_price: r.unit_price,
          })),
        }),
      })
      const data = await res.json()
      if (data.success) {
        qc.invalidateQueries({ queryKey: ['stocks'] })
        setStep('done')
      } else {
        setError(data.error || 'Upload failed')
      }
    } catch {
      setError('Network error.')
    }
    setSaving(false)
  }

  const warnings = preview.filter(r => r.warning)

  const confirmColumns: ColumnDef<UploadPreviewRow, any>[] = [
    { accessorKey: 'item_code', header: 'Code' },
    { accessorKey: 'item_name', header: 'Item Name' },
    { accessorKey: 'qty', header: 'Edit-Out Qty', cell: ({ getValue }) => (getValue() as number).toLocaleString('en-IN') },
    { accessorKey: 'unit_price', header: 'Price', cell: ({ getValue }) => `₹${(getValue() as number).toFixed(2)}` },
    { accessorKey: 'current_stock', header: 'Current Stock', cell: ({ getValue }) => (getValue() as number).toLocaleString('en-IN') },
    {
      accessorKey: 'stock_after',
      header: 'After',
      cell: ({ row, getValue }) => {
        const v = getValue() as number
        const warn = !!row.original.warning
        return <span className={warn ? 'text-red-600 font-medium' : 'font-medium'}>{v.toLocaleString('en-IN')}</span>
      },
    },
    {
      accessorKey: 'warning',
      header: 'Note',
      cell: ({ getValue }) => {
        const v = getValue() as string | undefined
        return v ? <span className="text-xs text-amber-600">{v}</span> : <span className="text-xs text-green-500">✓</span>
      },
    },
  ]

  return (
    <div>
      <h1 className="text-lg font-medium text-gray-900 mb-5">Upload Edit-Out</h1>

      {step === 'pick' && (
        <div className="bg-white border border-gray-100 rounded-xl p-5">
          <p className="text-sm text-gray-500 mb-4">Upload the daily Excel of items edited out at end of day. These will reduce stock.</p>
          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-1">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400 w-44" />
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
              <p className="text-xs text-gray-400">{filename} · {preview.length} items · {date}</p>
            </div>
            <button onClick={() => setStep('pick')} className="text-xs text-gray-400 hover:text-gray-600">← Back</button>
          </div>

          {warnings.length > 0 && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs font-medium text-amber-700 mb-1">{warnings.length} warning(s)</p>
              {warnings.slice(0, 3).map(w => (
                <p key={w.item_code} className="text-xs text-amber-600">• {w.item_code} ({w.item_name}): {w.warning}</p>
              ))}
              {warnings.length > 3 && <p className="text-xs text-amber-600">...and {warnings.length - 3} more</p>}
            </div>
          )}

          <DataTable data={preview} columns={confirmColumns} />

          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

          <div className="mt-4 flex gap-3">
            <button onClick={confirm} disabled={saving}
              className="px-5 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50">
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
            <p className="text-xs text-gray-400 mb-5">{preview.length} items processed · {date}</p>
            <button onClick={() => { setStep('pick'); setPreview([]); setFilename('') }}
              className="px-5 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800">
              Upload Another
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
