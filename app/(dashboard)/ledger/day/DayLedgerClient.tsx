'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/DataTable'
import type { LedgerEntry } from '@/types'

const columns: ColumnDef<LedgerEntry, unknown>[] = [
  { accessorKey: 'item_code', header: 'Code' },
  { accessorKey: 'item_name', header: 'Item Name' },
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
    header: 'Qty',
    cell: ({ row, getValue }) => {
      const value = getValue() as number
      const type = row.original.entry_type
      return <span className={type === 'in' ? 'text-green-600' : 'text-red-600'}>{type === 'in' ? '+' : '-'}{value.toLocaleString('en-IN')}</span>
    },
  },
  { accessorKey: 'unit_price', header: 'Price', cell: ({ getValue }) => `₹${(getValue() as number).toFixed(2)}` },
  {
    accessorKey: 'unit_cost',
    header: 'Cost',
    cell: ({ row, getValue }) => {
      const cost = getValue() as number
      return row.original.entry_type === 'out' && cost > 0 ? `₹${cost.toFixed(2)}` : <span className="text-gray-300">—</span>
    },
  },
  {
    id: 'margin',
    header: 'Margin',
    cell: ({ row }) => {
      if (row.original.entry_type !== 'out' || !row.original.unit_cost) return <span className="text-gray-300">—</span>
      const margin = (row.original.unit_price - row.original.unit_cost) * row.original.qty
      return <span className={margin >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>₹{margin.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
    },
  },
  { accessorKey: 'balance_after', header: 'Balance After', cell: ({ getValue }) => <span className="font-medium">{(getValue() as number).toLocaleString('en-IN')}</span> },
]

export default function DayLedgerClient() {
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA'))


  const { data: entries = [], isLoading } = useQuery<LedgerEntry[]>({
    queryKey: ['ledger', 'day', date],
    queryFn: async () => {
      const response = await fetch(`/api/stock/ledger?type=day&date=${date}`)
      return response.json() as Promise<LedgerEntry[]>
    },
    enabled: Boolean(date),
  })

  const inItems = entries.filter(entry => entry.entry_type === 'in')
  const outItems = entries.filter(entry => entry.entry_type === 'out')
  const revenue = outItems.reduce((sum, entry) => sum + entry.qty * entry.unit_price, 0)
  const cost = outItems.reduce((sum, entry) => sum + entry.qty * entry.unit_cost, 0)
  const profit = revenue - cost
  const hasCostData = outItems.some(entry => entry.unit_cost > 0)

  return (
    <div>
      <h1 className="text-lg font-medium text-gray-900 mb-5">Day Ledger</h1>

      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <div className="mb-5">
          <label className="block text-xs text-gray-500 mb-1">Select Date</label>
          <input
            type="date"
            value={date}
            onChange={event => setDate(event.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400 w-44"
          />
        </div>

        {entries.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Stock In (units)</p>
              <p className="text-xl font-medium text-green-600">{inItems.reduce((sum, entry) => sum + entry.qty, 0).toLocaleString('en-IN')}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Edit-Out (units)</p>
              <p className="text-xl font-medium text-red-600">{outItems.reduce((sum, entry) => sum + entry.qty, 0).toLocaleString('en-IN')}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Revenue</p>
              <p className="text-xl font-medium">₹{revenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Cost</p>
              {hasCostData
                ? <p className="text-xl font-medium text-gray-600">₹{cost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
                : <p className="text-sm text-gray-400 mt-1">No cost data</p>}
            </div>
            <div className={`rounded-lg p-3 col-span-2 ${hasCostData ? (profit >= 0 ? 'bg-green-50' : 'bg-red-50') : 'bg-gray-50'}`}>
              <p className="text-xs text-gray-400 mb-1">Gross Profit</p>
              {hasCostData
                ? <p className={`text-xl font-medium ${profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    ₹{profit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    <span className="text-sm font-normal ml-2 opacity-70">
                      ({revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0}% margin)
                    </span>
                  </p>
                : <p className="text-sm text-gray-400 mt-1">Upload a file after migration to see profit</p>}
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
