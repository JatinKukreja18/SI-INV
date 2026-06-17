import { requireSession } from '@/lib/server-auth';
import { getEffectiveRole } from '@/lib/view-role';
import type { Role } from '@/types';
import ItemLedgerClient from './ItemLedgerClient';

export default async function ItemLedgerPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const session = await requireSession();
  const effectiveRole: Role = await getEffectiveRole(session.user.role);
  const { code } = await searchParams;
  return <ItemLedgerClient initialCode={code} role={effectiveRole} />;
}
