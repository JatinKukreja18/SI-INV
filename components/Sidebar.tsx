'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import type { DataScope, Role } from '@/types';

const adminNav = [
  { href: '/dashboard', label: 'Dashboard', icon: '▦' },
  { href: '/stock-in', label: 'Stock In', icon: '↓' },
  { href: '/upload', label: 'Upload Sales', icon: '↑' },
  { href: '/ledger/item', label: 'Item Master', icon: '≡' },
  { href: '/ledger/day', label: 'Day Ledger', icon: '⊞' },
];

const staffNav = [
  { href: '/dashboard', label: 'Dashboard', icon: '▦' },
  { href: '/stock-in', label: 'Stock In', icon: '↓' },
  { href: '/upload', label: 'Upload Sales', icon: '↑' },
  { href: '/ledger/item', label: 'Item Master', icon: '≡' },
  { href: '/ledger/day', label: 'Day Ledger', icon: '⊞' },
];
type SidebarProps = {
  actualRole: Role;
  effectiveRole: Role;
  dataScope: DataScope;
  userName: string;
};

export function Sidebar({ actualRole, effectiveRole, dataScope, userName }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const nav = effectiveRole === 'admin' ? adminNav : staffNav;
  const canPreview = actualRole === 'admin';

  async function setPreviewRole(nextRole: Role) {
    if (!canPreview) return;

    await fetch('/api/view-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: nextRole }),
    });
    router.refresh();
  }

  return (
    <aside className="w-52 bg-white border-r border-gray-100 flex flex-col h-screen shrink-0">
      <div className="px-5 py-4 border-b border-gray-100">
        <p className="text-sm font-medium text-gray-900">StockLedger</p>
        <p className="text-xs text-gray-400 mt-0.5 truncate">{userName}</p>
        <p className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
          dataScope === 'live' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
        }`}>
          {dataScope === 'live' ? 'Live Store' : 'Demo Store'}
        </p>
        <div className="py-1.5 mb-1">
          <span
            className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
              effectiveRole === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'
            }`}
          >
            {effectiveRole === actualRole ? effectiveRole : `${effectiveRole} preview`}
          </span>
        </div>
        {canPreview && (
          <div className="mt-2 rounded-lg bg-gray-50 p-1">
            <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">View as</p>
            <div className="grid grid-cols-2 gap-1">
              {(['admin', 'staff'] as Role[]).map((roleOption) => {
                const active = effectiveRole === roleOption;
                return (
                  <button
                    key={roleOption}
                    type="button"
                    onClick={() => setPreviewRole(roleOption)}
                    className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                      active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    {roleOption === 'admin' ? 'Admin' : 'Employee'}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 py-3 px-2">
        {nav.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm mb-0.5 transition-colors ${
                active ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <span className="text-xs w-4 text-center">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-2 py-3 border-t border-gray-100">
        <Link
          href="/settings"
          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm mb-0.5 transition-colors ${
            pathname === '/settings' ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <span className="text-xs w-4 text-center">⚙</span>
          Settings
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
