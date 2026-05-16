'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { UploadBatch } from '@/types';
import { formatDate } from '@/lib/format';

type BatchWithUser = UploadBatch & {
  users: { name: string; email: string } | null;
};

function formatTime(isoStr: string) {
  return new Date(isoStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export default function BatchHistoryClient() {
  const router = useRouter();

  const { data: batches = [], isLoading } = useQuery<BatchWithUser[]>({
    queryKey: ['stock-batches'],
    queryFn: async () => {
      const res = await fetch('/api/stock/batches');
      return res.json() as Promise<BatchWithUser[]>;
    },
  });

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <Link href="/stock-in" className="text-gray-400 hover:text-gray-600 text-sm">
          ← Stock In
        </Link>
        <span className="text-gray-200">/</span>
        <h1 className="text-lg font-medium text-gray-900">Batch History</h1>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : batches.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No stock-in batches yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-xs text-gray-400 font-medium px-5 py-3">Date</th>
                <th className="text-left text-xs text-gray-400 font-medium px-5 py-3">File / Source</th>
                <th className="text-right text-xs text-gray-400 font-medium px-5 py-3">Items</th>
                <th className="text-left text-xs text-gray-400 font-medium px-5 py-3">Posted By</th>
                <th className="text-left text-xs text-gray-400 font-medium px-5 py-3">Time</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr
                  key={batch.id}
                  onClick={() => router.push(`/stock-in/history/${batch.id}`)}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60 cursor-pointer"
                >
                  <td className="px-5 py-3 text-gray-700">{formatDate(batch.upload_date)}</td>
                  <td className="px-5 py-3 text-gray-500 max-w-xs truncate">
                    {batch.filename ?? <span className="text-gray-300 italic">Manual entry</span>}
                  </td>
                  <td className="px-5 py-3 text-right text-gray-700">{batch.total_items}</td>
                  <td className="px-5 py-3 text-gray-500">{batch.users?.name ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-400 text-xs">{formatTime(batch.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
