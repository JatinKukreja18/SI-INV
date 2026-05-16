'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';

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
type SidebarProps = { role: string; userName: string };

export function Sidebar({ role, userName }: SidebarProps) {
  const pathname = usePathname();
  const nav = role === 'admin' ? adminNav : staffNav;

  return (
    <aside className="w-52 bg-white border-r border-gray-100 flex flex-col h-screen shrink-0">
      <div className="px-5 py-4 border-b border-gray-100">
        <p className="text-sm font-medium text-gray-900">StockLedger</p>
        <p className="text-xs text-gray-400 mt-0.5 truncate">{userName}</p>
        <div className="py-1.5 mb-1">
          <span
            className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
              role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'
            }`}
          >
            {role}
          </span>
        </div>
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
