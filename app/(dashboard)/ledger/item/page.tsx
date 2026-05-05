'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DataTable } from '@/components/ui/DataTable'
import { StockItem, LedgerEntry } from '@/types'
import { ColumnDef } from '@tanstack/react-table'

const columns: ColumnDef<LedgerEntry, any>[] = [
  { accessorKey: 'entry_date', header: 'Date' },
  {
    accessorKey: 'entry_type',
    header: 'Type',
    cell: ({ getValue }) => {
      const v = getValue() as string
      return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${v === 'in' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
        {v === 'in' ? 'IN' : 'OUT'}
      </span>
    },
  },
  {
    accessorKey: 'qty',
    header: 'Quantity',
    cell: ({ row, getValue }) => {
      const v = getValue() as number
      const type = row.original.entry_type
      return <span className={type === 'in' ? 'text-green-600' : 'text-red-600'}>
        {type === 'in' ? '+' : '-'}{v.toLocaleString('en-IN')}
      </span>
    },
  },
  { accessorKey: 'unit_price', header: 'Unit Price', cell: ({ getValue }) => `₹${(getValue() as number).toFixed(2)}` },
  { accessorKey: 'balance_after', header: 'Balance', cell: ({ getValue }) => <span className="font-medium">{(getValue() as number).toLocaleString('en-IN')}</span> },
]

export default function ItemLedgerPage() {
  const [selectedCode, setSelectedCode] = useState<string>('')

  const { data: stocks = [] } = useQuery<StockItem[]>({
    queryKey: ['stocks'],
    queryFn: () => fetch('/api/stock').then(r => r.json()),
  })

  const { data: entries = [], isLoading } = useQuery<LedgerEntry[]>({
    queryKey: ['ledger', 'item', selectedCode],
    queryFn: () => fetch(`/api/stock/ledger?type=item&code=${selectedCode}`).then(r => r.json()),
    enabled: !!selectedCode,
  })

  const selected = stocks.find(s => s.item_code === selectedCode)

  return (
    <div>
      <h1 className="text-lg font-medium text-gray-900 mb-5">Item Ledger</h1>

      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <div className="mb-5">
          <label className="block text-xs text-gray-500 mb-1">Select Item</label>
          <select value={selectedCode} onChange={e => setSelectedCode(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400 w-80">
            <option value="">— Choose an item —</option>
            {stocks.map(s => (
              <option key={s.item_code} value={s.item_code}>{s.item_code} — {s.item_name}</option>
            ))}
          </select>
        </div>

        {selected && (
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Current Stock</p>
              <p className="text-xl font-medium">{selected.current_qty.toLocaleString('en-IN')}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Last Price</p>
              <p className="text-xl font-medium">₹{selected.last_price.toFixed(2)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Total Transactions</p>
              <p className="text-xl font-medium">{entries.length}</p>
            </div>
          </div>
        )}

        {!selectedCode && <p className="text-sm text-gray-400 py-8 text-center">Select an item to view its ledger</p>}
        {selectedCode && isLoading && <p className="text-sm text-gray-400 py-8 text-center">Loading...</p>}
        {selectedCode && !isLoading && <DataTable data={entries} columns={columns} />}
      </div>
    </div>
  )
}
