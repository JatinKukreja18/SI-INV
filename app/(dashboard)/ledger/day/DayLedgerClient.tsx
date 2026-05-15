'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/DataTable'
import type { LedgerEntry } from '@/types'

interface MergedDayRow {
  item_code: string
  item_name: string
  stock_in: number
  in_price: number
  sale_out: number
  out_price: number
  unit_cost: number
  balance_after: number
}

function buildColumns(marginAsPercent: boolean, onToggle: () => void): ColumnDef<MergedDayRow, unknown>[] {
  return [
    { accessorKey: 'item_code', header: 'Code', cell: ({ getValue }) => <span className="text-xs text-gray-400">{getValue() as string}</span> },
    { accessorKey: 'item_name', header: 'Item Name' },
    {
      accessorKey: 'stock_in',
      header: 'Stock In',
      cell: ({ getValue }) => {
        const v = getValue() as number
        return v > 0
          ? <span className="text-green-600 font-medium">+{v.toLocaleString('en-IN')}</span>
          : <span className="text-gray-300">—</span>
      },
    },
    {
      accessorKey: 'in_price',
      header: 'In Price',
      cell: ({ row, getValue }) => {
        const v = getValue() as number
        return row.original.stock_in > 0 && v > 0
          ? `₹${v.toFixed(2)}`
          : <span className="text-gray-300">—</span>
      },
    },
    {
      accessorKey: 'sale_out',
      header: 'Sale Out',
      cell: ({ getValue }) => {
        const v = getValue() as number
        return v > 0
          ? <span className="text-red-600 font-medium">-{v.toLocaleString('en-IN')}</span>
          : <span className="text-gray-300">—</span>
      },
    },
    {
      accessorKey: 'out_price',
      header: 'Sale Price',
      cell: ({ row, getValue }) => {
        const v = getValue() as number
        return row.original.sale_out > 0 && v > 0
          ? `₹${v.toFixed(2)}`
          : <span className="text-gray-300">—</span>
      },
    },
    {
      id: 'margin',
      header: () => (
        <span className="flex items-center gap-1.5">
          Margin
          <button
            onClick={e => { e.stopPropagation(); onToggle() }}
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded transition-colors ${
              marginAsPercent
                ? 'bg-gray-700 text-white'
                : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
            }`}
          >
            %
          </button>
        </span>
      ),
      cell: ({ row }) => {
        const { sale_out, out_price, unit_cost } = row.original
        if (!sale_out || !unit_cost) return <span className="text-gray-300">—</span>
        if (marginAsPercent) {
          const pct = out_price > 0 ? ((out_price - unit_cost) / out_price) * 100 : 0
          const color = pct >= 0 ? 'text-green-600' : 'text-red-600'
          return <span className={`${color} font-medium`}>{pct.toFixed(1)}%</span>
        }
        const abs = (out_price - unit_cost) * sale_out
        const color = abs >= 0 ? 'text-green-600' : 'text-red-600'
        return <span className={`${color} font-medium`}>₹{abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
      },
    },
    {
      accessorKey: 'balance_after',
      header: 'Balance',
      cell: ({ getValue }) => <span className="font-medium">{(getValue() as number).toLocaleString('en-IN')}</span>,
    },
  ]
}

export default function DayLedgerClient() {
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA'))
  const [marginAsPercent, setMarginAsPercent] = useState(true)

  const { data: entries = [], isLoading } = useQuery<LedgerEntry[]>({
    queryKey: ['ledger', 'day', date],
    queryFn: async () => {
      const response = await fetch(`/api/stock/ledger?type=day&date=${date}`)
      return response.json() as Promise<LedgerEntry[]>
    },
    enabled: Boolean(date),
  })

  const columns = useMemo(
    () => buildColumns(marginAsPercent, () => setMarginAsPercent(v => !v)),
    [marginAsPercent]
  )

  const merged = useMemo<MergedDayRow[]>(() => {
    const map = new Map<string, MergedDayRow>()
    const sorted = [...entries].sort((a, b) => a.created_at.localeCompare(b.created_at))
    for (const e of sorted) {
      const row = map.get(e.item_code)
      if (!row) {
        map.set(e.item_code, {
          item_code: e.item_code,
          item_name: e.item_name,
          stock_in: e.entry_type === 'in' ? e.qty : 0,
          in_price: e.entry_type === 'in' ? e.unit_price : 0,
          sale_out: e.entry_type === 'out' ? e.qty : 0,
          out_price: e.entry_type === 'out' ? e.unit_price : 0,
          unit_cost: e.entry_type === 'out' ? e.unit_cost : 0,
          balance_after: e.balance_after,
        })
      } else {
        if (e.entry_type === 'in') {
          row.stock_in += e.qty
          row.in_price = e.unit_price
        } else {
          row.sale_out += e.qty
          row.out_price = e.unit_price
          if (e.unit_cost > 0) row.unit_cost = e.unit_cost
        }
        row.balance_after = e.balance_after
      }
    }
    return [...map.values()]
  }, [entries])

  const inItems = entries.filter(e => e.entry_type === 'in')
  const outItems = entries.filter(e => e.entry_type === 'out')
  const revenue = outItems.reduce((sum, e) => sum + e.qty * e.unit_price, 0)
  const cost = outItems.reduce((sum, e) => sum + e.qty * e.unit_cost, 0)
  const profit = revenue - cost
  const hasCostData = outItems.some(e => e.unit_cost > 0)

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
              <p className="text-xl font-medium text-green-600">{inItems.reduce((sum, e) => sum + e.qty, 0).toLocaleString('en-IN')}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Sales (units)</p>
              <p className="text-xl font-medium text-red-600">{outItems.reduce((sum, e) => sum + e.qty, 0).toLocaleString('en-IN')}</p>
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
        {!isLoading && merged.length > 0 && (
          <DataTable data={merged} columns={columns} searchPlaceholder="Search items…" searchKey="item_name" stickyHeader />
        )}
      </div>
    </div>
  )
}
