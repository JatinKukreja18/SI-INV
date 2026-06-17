'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/DataTable'
import type { LedgerEntry, Role, StockItem } from '@/types'
import { AddItemDialog } from '@/components/ui/AddItemDialog'
import type { AddItemFormValues } from '@/components/ui/AddItemDialog'
import { toast } from 'sonner'
import { formatDate } from '@/lib/format'

const columns: ColumnDef<LedgerEntry, unknown>[] = [
  {
    accessorKey: 'entry_date',
    header: 'Date',
    cell: ({ getValue }) => formatDate(getValue() as string),
  },
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

export default function ItemMasterClient({ initialCode, role }: { initialCode?: string; role: Role }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const isAdmin = role === 'admin'
  const [search, setSearch] = useState(initialCode ?? '')
  const [open, setOpen] = useState(false)
  const [selectedCode, setSelectedCode] = useState(initialCode ?? '')
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [dialogDefaults, setDialogDefaults] = useState<Partial<AddItemFormValues>>({})

  async function handleAddItem(values: AddItemFormValues) {
    const res = await fetch('/api/stock/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_code: values.item_code, item_name: values.item_name, ean_code: values.ean_code || undefined }),
    })
    if (res.ok) {
      toast.success(`${values.item_name} added to Item Master`)
      setAddDialogOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['stocks'] })
      setSelectedCode(values.item_code)
      setSearch(values.item_name)
    } else {
      const data = await res.json() as { error?: string }
      toast.error(data.error ?? 'Failed to add item')
    }
  }

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

  const selected = stocks.find(s => s.item_code === selectedCode)

  const query = search.trim().toLowerCase()
  const filtered = query.length < 1 ? [] : stocks.filter(s =>
    s.item_code.toLowerCase().includes(query) ||
    (s.ean_code ?? '').toLowerCase().includes(query) ||
    s.item_name.toLowerCase().includes(query)
  ).slice(0, 8)

  const exactMatch = stocks.find(s =>
    s.item_code.toLowerCase() === query ||
    (s.ean_code ?? '').toLowerCase() === query
  )
  const showAddNew = query.length > 0 && !exactMatch

  async function handleDelete() {
    if (!selected) return
    if (!confirm(`Delete "${selected.item_name}"? This cannot be undone.`)) return
    const res = await fetch(`/api/stock/items?code=${encodeURIComponent(selected.item_code)}`, { method: 'DELETE' })
    const data = await res.json() as { error?: string }
    if (!res.ok) { toast.error(data.error ?? 'Failed to delete item'); return }
    toast.success(`${selected.item_name} deleted`)
    setSelectedCode('')
    setSearch('')
    router.replace('/ledger/item', { scroll: false })
    queryClient.invalidateQueries({ queryKey: ['stocks'] })
  }

  function selectStock(stock: StockItem) {
    setSelectedCode(stock.item_code)
    setSearch(stock.item_name)
    setOpen(false)
    router.replace(`/ledger/item?code=${stock.item_code}`, { scroll: false })
  }

  function openAddNewDialog() {
    const term = search.trim()
    const isEan = /^\d{8,14}$/.test(term)
    const isNumeric = /^\d+$/.test(term)
    const defaults = isEan ? { ean_code: term } : isNumeric ? { item_code: term } : { item_name: term }
    setDialogDefaults(defaults)
    setOpen(false)
    setAddDialogOpen(true)
  }

  const stockStatus = selected
    ? selected.current_qty <= 0 ? { label: 'Out of Stock', cls: 'bg-red-100 text-red-700' }
    : selected.current_qty <= 5 ? { label: 'Low Stock', cls: 'bg-amber-100 text-amber-700' }
    : { label: 'In Stock', cls: 'bg-green-100 text-green-700' }
    : null

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-medium text-gray-900">Item Master</h1>
        <button
          onClick={() => { setDialogDefaults({}); setAddDialogOpen(true) }}
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800"
        >
          + Add Item
        </button>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-5 mb-4">
        <div className="relative">
          <label className="block text-xs text-gray-500 mb-1">Search by item code, EAN or name</label>
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setOpen(true)
              if (!e.target.value.trim()) {
                setSelectedCode('')
                router.replace('/ledger/item', { scroll: false })
              }
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && filtered.length === 1) selectStock(filtered[0])
              if (e.key === 'Escape') setOpen(false)
            }}
            placeholder="Type item code, EAN or name…"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
          />
          {open && (filtered.length > 0 || showAddNew) && (
            <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
              {filtered.map(stock => (
                <button
                  key={stock.item_code}
                  onMouseDown={() => selectStock(stock)}
                  className="w-full text-left px-3 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                >
                  <span className="text-xs text-gray-400 mr-2">{stock.item_code}</span>
                  <span className="text-sm text-gray-900">{stock.item_name}</span>
                  {stock.ean_code && <span className="text-xs text-gray-400 ml-2">· {stock.ean_code}</span>}
                  <span className="float-right text-xs text-gray-400">Stock: {stock.current_qty}</span>
                </button>
              ))}
              {showAddNew && (
                <button
                  onMouseDown={openAddNewDialog}
                  className="w-full text-left px-3 py-2.5 hover:bg-gray-50 text-sm text-blue-600"
                >
                  + Add &ldquo;{search.trim()}&rdquo; as new item
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {selected && (
        <>
          <div className="bg-white border border-gray-100 rounded-xl p-5 mb-4">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-base font-medium text-gray-900">{selected.item_name}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{selected.item_code}{selected.ean_code ? ` · EAN: ${selected.ean_code}` : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                {stockStatus && (
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${stockStatus.cls}`}>{stockStatus.label}</span>
                )}
                {isAdmin && entries.length === 0 && !isLoading && (
                  <button
                    onClick={handleDelete}
                    className="text-xs px-2.5 py-1 rounded-full font-medium bg-red-50 text-red-600 hover:bg-red-100"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-1">Current Stock</p>
                <p className={`text-xl font-medium ${selected.current_qty <= 0 ? 'text-red-600' : selected.current_qty <= 5 ? 'text-amber-600' : 'text-gray-900'}`}>
                  {selected.current_qty.toLocaleString('en-IN')}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-1">Last Price</p>
                <p className="text-xl font-medium text-gray-900">₹{selected.last_price.toFixed(2)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-1">Stock Value</p>
                <p className="text-xl font-medium text-gray-900">₹{(selected.current_qty * selected.last_price).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-400 mb-1">Total Transactions</p>
                <p className="text-xl font-medium text-gray-900">{entries.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-xl p-5">
            <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-4">Transaction History</h2>
            {isLoading
              ? <p className="text-sm text-gray-400 py-8 text-center">Loading...</p>
              : <DataTable data={entries} columns={columns} searchPlaceholder="Search transactions…" searchKey="entry_date" />
            }
          </div>
        </>
      )}

      {!selectedCode && (
        <div className="bg-white border border-gray-100 rounded-xl p-5">
          <p className="text-sm text-gray-400 py-8 text-center">Search for an item to view its details and ledger</p>
        </div>
      )}

      <AddItemDialog
        open={addDialogOpen}
        defaultValues={dialogDefaults}
        showStockFields={false}
        onClose={() => setAddDialogOpen(false)}
        onConfirm={handleAddItem}
      />
    </div>
  )
}
