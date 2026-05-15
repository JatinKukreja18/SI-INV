'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { LedgerEntry, UploadBatch } from '@/types';

type BatchWithUser = UploadBatch & {
  users: { name: string; email: string } | null;
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function BatchDetailClient({ batchId }: { batchId: string }) {
  const { data: entries = [], isLoading: entriesLoading } = useQuery<LedgerEntry[]>({
    queryKey: ['batch-entries', batchId],
    queryFn: async () => {
      const res = await fetch(`/api/stock/batches/${batchId}`);
      return res.json() as Promise<LedgerEntry[]>;
    },
  });

  const { data: batches = [] } = useQuery<BatchWithUser[]>({
    queryKey: ['stock-batches'],
    queryFn: async () => {
      const res = await fetch('/api/stock/batches');
      return res.json() as Promise<BatchWithUser[]>;
    },
  });

  const batch = batches.find((b) => b.id === batchId);

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

      {batch && (
        <div className="flex items-center gap-6 mb-4 text-xs text-gray-400">
          {batch.filename && <span>{batch.filename}</span>}
          <span>{batch.total_items} items</span>
          {batch.users?.name && <span>Posted by {batch.users.name}</span>}
        </div>
      )}

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
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/40">
                  <td className="px-5 py-3 text-gray-400 text-xs">{entry.item_code}</td>
                  <td className="px-5 py-3 text-gray-700">{entry.item_name}</td>
                  <td className="px-5 py-3 text-right text-gray-700">+{entry.qty}</td>
                  <td className="px-5 py-3 text-right text-gray-700">{entry.unit_price.toLocaleString('en-IN')}</td>
                  <td className="px-5 py-3 text-right text-gray-500">{entry.balance_after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
