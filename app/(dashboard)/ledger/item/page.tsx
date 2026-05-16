import ItemLedgerClient from './ItemLedgerClient';

export default async function ItemLedgerPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  return <ItemLedgerClient initialCode={code} />;
}
