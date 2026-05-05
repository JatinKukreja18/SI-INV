'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/DataTable'
import type { LedgerEntry, StockItem } from '@/types'

const columns: ColumnDef<LedgerEntry, unknown>[] = [
  { accessorKey: 'entry_date', header: 'Date' },
  {
    accessorKey: 'entry_type',
    header: 'Type',
    cell: ({ getValue }) => {
      const value = getValue() as string
      return (
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${value === 'in' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {value === 'in' ? 'IN' : 'OUT'}
        </span>
      )
    },
  },
  {
    accessorKey: 'qty',
    header: 'Quantity',
    cell: ({ row, getValue }) => {
      const value = getValue() as number
      const type = row.original.entry_type
      return <span className={type === 'in' ? 'text-green-600' : 'text-red-600'}>{type === 'in' ? '+' : '-'}{value.toLocaleString('en-IN')}</span>
    },
  },
  { accessorKey: 'unit_price', header: 'Unit Price', cell: ({ getValue }) => `₹${(getValue() as number).toFixed(2)}` },
  { accessorKey: 'balance_after', header: 'Balance', cell: ({ getValue }) => <span className="font-medium">{(getValue() as number).toLocaleString('en-IN')}</span> },
]

export default function ItemLedgerClient() {
  const [selectedCode, setSelectedCode] = useState('')

  const { data: stocks = [] } = useQuery<StockItem[]>({
    queryKey: ['stocks'],
    queryFn: async () => {
      const response = await fetch('/api/stock')
      return response.json() as Promise<StockItem[]>
    },
  })

  const { data: entries = [], isLoading } = useQuery<LedgerEntry[]>({
    queryKey: ['ledger', 'item', selectedCode],
    queryFn: async () => {
      const response = await fetch(`/api/stock/ledger?type=item&code=${selectedCode}`)
      return response.json() as Promise<LedgerEntry[]>
    },
    enabled: Boolean(selectedCode),
  })

  const selected = stocks.find(stock => stock.item_code === selectedCode)

  return (
    <div>
      <h1 className="text-lg font-medium text-gray-900 mb-5">Item Ledger</h1>

      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <div className="mb-5">
          <label className="block text-xs text-gray-500 mb-1">Select Item</label>
          <select
            value={selectedCode}
            onChange={event => setSelectedCode(event.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400 w-80"
          >
            <option value="">— Choose an item —</option>
            {stocks.map(stock => (
              <option key={stock.item_code} value={stock.item_code}>
                {stock.item_code} — {stock.item_name}
              </option>
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
