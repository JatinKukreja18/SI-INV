'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DataTable } from '@/components/ui/DataTable'
import { LedgerEntry } from '@/types'
import { ColumnDef } from '@tanstack/react-table'

const columns: ColumnDef<LedgerEntry, any>[] = [
  { accessorKey: 'item_code', header: 'Code' },
  { accessorKey: 'item_name', header: 'Item Name' },
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
    header: 'Qty',
    cell: ({ row, getValue }) => {
      const v = getValue() as number
      const t = row.original.entry_type
      return <span className={t === 'in' ? 'text-green-600' : 'text-red-600'}>{t === 'in' ? '+' : '-'}{v.toLocaleString('en-IN')}</span>
    },
  },
  { accessorKey: 'unit_price', header: 'Price', cell: ({ getValue }) => `₹${(getValue() as number).toFixed(2)}` },
  { accessorKey: 'balance_after', header: 'Balance After', cell: ({ getValue }) => <span className="font-medium">{(getValue() as number).toLocaleString('en-IN')}</span> },
]

export default function DayLedgerPage() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))

  const { data: entries = [], isLoading } = useQuery<LedgerEntry[]>({
    queryKey: ['ledger', 'day', date],
    queryFn: () => fetch(`/api/stock/ledger?type=day&date=${date}`).then(r => r.json()),
    enabled: !!date,
  })

  const inItems = entries.filter(e => e.entry_type === 'in')
  const outItems = entries.filter(e => e.entry_type === 'out')
  const outValue = outItems.reduce((s, e) => s + e.qty * e.unit_price, 0)

  return (
    <div>
      <h1 className="text-lg font-medium text-gray-900 mb-5">Day Ledger</h1>

      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <div className="mb-5">
          <label className="block text-xs text-gray-500 mb-1">Select Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400 w-44" />
        </div>

        {entries.length > 0 && (
          <div className="grid grid-cols-4 gap-3 mb-5">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Total Transactions</p>
              <p className="text-xl font-medium">{entries.length}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Stock In (units)</p>
              <p className="text-xl font-medium text-green-600">{inItems.reduce((s, e) => s + e.qty, 0).toLocaleString('en-IN')}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Edit-Out (units)</p>
              <p className="text-xl font-medium text-red-600">{outItems.reduce((s, e) => s + e.qty, 0).toLocaleString('en-IN')}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Edit-Out Value</p>
              <p className="text-xl font-medium">₹{outValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
            </div>
          </div>
        )}

        {isLoading && <p className="text-sm text-gray-400 py-8 text-center">Loading...</p>}
        {!isLoading && entries.length === 0 && <p className="text-sm text-gray-400 py-8 text-center">No entries for this date</p>}
        {!isLoading && entries.length > 0 && <DataTable data={entries} columns={columns} searchPlaceholder="Search items..." searchKey="item_name" />}
      </div>
    </div>
  )
}
