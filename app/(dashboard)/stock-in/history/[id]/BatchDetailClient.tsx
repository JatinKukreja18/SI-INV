'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { LedgerEntry, UploadBatch, Role } from '@/types';
import { formatDate } from '@/lib/format';
import { fetchJsonArray } from '@/lib/api-client';

type BatchWithUser = UploadBatch & {
  users: { name: string; email: string } | null;
};

type EditableEntry = LedgerEntry & { _dirty?: boolean };

export default function BatchDetailClient({ batchId, role }: { batchId: string; role: Role }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draftEntries, setDraftEntries] = useState<EditableEntry[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: entries = [], isLoading: entriesLoading } = useQuery<LedgerEntry[]>({
    queryKey: ['batch-entries', batchId],
    queryFn: () => fetchJsonArray<LedgerEntry>(`/api/stock/batches/${batchId}`),
  });

  const { data: batches = [] } = useQuery<BatchWithUser[]>({
    queryKey: ['stock-batches'],
    queryFn: () => fetchJsonArray<BatchWithUser>('/api/stock/batches'),
  });

  const batch = batches.find((b) => b.id === batchId);

  function startEditing() {
    setDraftEntries(entries.map((e) => ({ ...e })));
    setEditing(true);
  }

  function cancelEditing() {
    setDraftEntries([]);
    setEditing(false);
  }

  function updateDraft(id: string, field: 'item_name' | 'qty' | 'unit_price', value: string) {
    setDraftEntries((prev) =>
      prev.map((e) =>
        e.id === id
          ? { ...e, [field]: field === 'item_name' ? value : Number(value), _dirty: true }
          : e
      )
    );
  }

  async function saveEdits() {
    const changed = draftEntries.filter((e) => e._dirty);
    if (!changed.length) { setEditing(false); return; }

    setSaving(true);
    try {
      const res = await fetch(`/api/stock/batches/${batchId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: changed.map((e) => ({
            entry_id: e.id,
            qty: e.qty,
            unit_price: e.unit_price,
            item_name: e.item_name,
          })),
        }),
      });

      if (res.ok) {
        toast.success('Batch updated');
        await queryClient.invalidateQueries({ queryKey: ['batch-entries', batchId] });
        await queryClient.invalidateQueries({ queryKey: ['stocks'] });
        setEditing(false);
      } else {
        const body = await res.json() as { error?: string };
        toast.error(body.error ?? 'Update failed');
      }
    } catch {
      toast.error('Network error — please try again.');
    } finally {
      setSaving(false);
    }
  }

  const displayEntries: EditableEntry[] = editing ? draftEntries : entries;

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <Link href="/stock-in" className="text-gray-400 hover:text-gray-600 text-sm">
          ← Stock In
        </Link>
        <span className="text-gray-200">/</span>
        <Link href="/stock-in/history" className="text-gray-400 hover:text-gray-600 text-sm">
          History
        </Link>
        <span className="text-gray-200">/</span>
        <h1 className="text-lg font-medium text-gray-900">
          {batch ? formatDate(batch.upload_date) : 'Batch Detail'}
        </h1>
      </div>

      <div className="flex items-center justify-between mb-4">
        {batch ? (
          <div className="flex items-center gap-6 text-xs text-gray-400">
            {batch.filename && <span>{batch.filename}</span>}
            <span>{batch.total_items} items</span>
            {batch.users?.name && <span>Posted by {batch.users.name}</span>}
          </div>
        ) : (
          <div />
        )}

        {role === 'admin' && !entriesLoading && entries.length > 0 && (
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button
                  onClick={cancelEditing}
                  className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdits}
                  disabled={saving}
                  className="text-xs px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </>
            ) : (
              <button
                onClick={startEditing}
                className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                Edit
              </button>
            )}
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        {entriesLoading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No entries found for this batch.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs text-gray-400 font-medium px-5 py-3">Code</th>
                <th className="text-left text-xs text-gray-400 font-medium px-5 py-3">Item Name</th>
                <th className="text-right text-xs text-gray-400 font-medium px-5 py-3">Qty</th>
                <th className="text-right text-xs text-gray-400 font-medium px-5 py-3">Unit Price (₹)</th>
                <th className="text-right text-xs text-gray-400 font-medium px-5 py-3">Balance After</th>
              </tr>
            </thead>
            <tbody>
              {displayEntries.map((entry) => (
                <tr key={entry.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/40">
                  <td className="px-5 py-2.5 text-gray-400 text-xs">{entry.item_code}</td>
                  <td className="px-5 py-2.5 text-gray-700">
                    {editing ? (
                      <input
                        value={entry.item_name}
                        onChange={(e) => updateDraft(entry.id, 'item_name', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-200 rounded focus:outline-none focus:border-gray-400 text-sm"
                      />
                    ) : (
                      entry.item_name
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-right text-gray-700">
                    {editing ? (
                      <input
                        type="number"
                        value={entry.qty}
                        onChange={(e) => updateDraft(entry.id, 'qty', e.target.value)}
                        className="w-20 px-2 py-1 border border-gray-200 rounded focus:outline-none focus:border-gray-400 text-sm text-right"
                      />
                    ) : (
                      `+${entry.qty}`
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-right text-gray-700">
                    {editing ? (
                      <input
                        type="number"
                        value={entry.unit_price}
                        onChange={(e) => updateDraft(entry.id, 'unit_price', e.target.value)}
                        className="w-24 px-2 py-1 border border-gray-200 rounded focus:outline-none focus:border-gray-400 text-sm text-right"
                      />
                    ) : (
                      entry.unit_price.toLocaleString('en-IN')
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-right text-gray-500">{entry.balance_after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
