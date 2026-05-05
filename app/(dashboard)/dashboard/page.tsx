'use client'
import { useQuery } from '@tanstack/react-query'
import { DataTable } from '@/components/ui/DataTable'
import { StockItem } from '@/types'
import { ColumnDef } from '@tanstack/react-table'

const columns: ColumnDef<StockItem, any>[] = [
  { accessorKey: 'item_code', header: 'Code' },
  { accessorKey: 'item_name', header: 'Item Name' },
  {
    accessorKey: 'current_qty',
    header: 'Current Stock',
    cell: ({ getValue }) => {
      const v = getValue() as number
      const color = v <= 0 ? 'text-red-600 font-medium' : v <= 5 ? 'text-amber-600 font-medium' : 'text-gray-900'
      return <span className={color}>{v.toLocaleString('en-IN')}</span>
    },
  },
  {
    accessorKey: 'last_price',
    header: 'Last Price',
    cell: ({ getValue }) => `₹${(getValue() as number).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const qty = row.original.current_qty
      if (qty <= 0) return <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">Out</span>
      if (qty <= 5) return <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">Low</span>
      return <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">OK</span>
    },
  },
]

export default function DashboardPage() {
  const { data: stocks = [], isLoading } = useQuery<StockItem[]>({
    queryKey: ['stocks'],
    queryFn: () => fetch('/api/stock').then(r => r.json()),
  })

  const total = stocks.length
  const low = stocks.filter(s => s.current_qty > 0 && s.current_qty <= 5).length
  const out = stocks.filter(s => s.current_qty <= 0).length
  const totalValue = stocks.reduce((sum, s) => sum + s.current_qty * s.last_price, 0)

  return (
    <div>
      <h1 className="text-lg font-medium text-gray-900 mb-5">Dashboard</h1>

      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total Items', value: total.toString() },
          { label: 'Stock Value', value: `₹${totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` },
          { label: 'Low Stock', value: low.toString(), warn: true },
          { label: 'Out of Stock', value: out.toString(), danger: true },
        ].map(m => (
          <div key={m.label} className="bg-white border border-gray-100 rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-1">{m.label}</p>
            <p className={`text-2xl font-medium ${m.danger ? 'text-red-600' : m.warn ? 'text-amber-600' : 'text-gray-900'}`}>
              {m.value}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-5">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-4">Current Stock</h2>
        {isLoading ? (
          <p className="text-sm text-gray-400 py-8 text-center">Loading...</p>
        ) : (
          <DataTable data={stocks} columns={columns} searchPlaceholder="Search items..." searchKey="item_name" />
        )}
      </div>
    </div>
  )
}
