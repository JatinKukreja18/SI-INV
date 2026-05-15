# SI Inventory — Claude Context

## Stack
- **Next.js 16.2.4** (App Router) · **React 19** · **TypeScript** · **Tailwind CSS v4**
- **Supabase** (Postgres + RPC) via `@supabase/supabase-js` — admin client in `lib/supabase.ts`
- **next-auth v4** — credentials provider, bcrypt passwords, roles: `admin | staff`
- **@tanstack/react-query v5** — all client data fetching; invalidate `['stocks']` after mutations
- **@tanstack/react-table v8** · **zod v4** · **sonner** (toasts) · **xlsx** · **recharts**
- No UI component library — custom Tailwind only

## Key files
| Path | Purpose |
|---|---|
| `types/index.ts` | All shared types (`StockItem`, `BatchItemInput`, `LedgerEntry`, `BatchOperationResult`, …) |
| `lib/inventory.ts` | Zod schemas, `mergeBatchItems`, `normalizeSheetRows`, `parseBatchResponse` |
| `lib/supabase.ts` | `supabaseAdmin` — server-side only |
| `lib/server-auth.ts` | `getServerAuthSession()` — use in every API route |
| `lib/auth.ts` | next-auth config |
| `components/ui/AddItemDialog.tsx` | Shared "Add New Item" modal (`showStockFields` prop toggles qty/price) |
| `components/ui/DataTable.tsx` | Generic sortable/searchable table |
| `components/Sidebar.tsx` | Nav |

## Page → client component pattern
Every page is a thin server component that renders a `*Client.tsx` sibling with `'use client'`.

| Route | Client file |
|---|---|
| `/dashboard` | `app/(dashboard)/dashboard/page.tsx` (server only) |
| `/stock-in` | `StockInClient.tsx` |
| `/ledger/item` | `ItemLedgerClient.tsx` |
| `/ledger/day` | `DayLedgerClient.tsx` |
| `/upload` | `app/(dashboard)/upload/page.tsx` (server only) |

## API routes
| Method + Path | Auth | Purpose |
|---|---|---|
| `GET /api/stock` | any | Fetch all `stock_items` ordered by name |
| `POST /api/stock` | admin | Post a stock-in batch via `post_inventory_batch` RPC |
| `POST /api/stock/items` | admin | Register item in catalog only (qty=0, no ledger entry) |
| `GET /api/stock/ledger` | any | Ledger entries — `?type=item&code=X` or `?type=day&date=Y` |
| `GET /api/sales/monthly` | any | Monthly sales aggregates |
| `POST /api/upload` | admin | Post an edit-out batch via `post_inventory_batch` RPC |
| `GET /api/upload/batches` | any | List upload batches |

## Database
**Tables:** `users`, `stock_items`, `ledger_entries`, `upload_batches`

**`stock_items`** — item master: `item_code` (unique), `item_name`, `current_qty`, `last_price`, `ean_code`

**`post_inventory_batch` RPC** — handles both batch types atomically:
- `stock_in`: upserts `stock_items` (creates if new, adds qty), writes `ledger_entries` type=`in`
- `edit_out`: subtracts qty (shortages abort the whole batch), writes `ledger_entries` type=`out`; duplicate detection by filename+date
- Returns `BatchOperationResult` JSON

## Conventions
- Auth check in every API route: `const session = await getServerAuthSession(); if (!session) return 401`
- Admin-only mutations: add `if (session.user.role !== 'admin') return 403`
- Toasts: `toast.success(...)` / `toast.error(...)` from `sonner`
- After any stock mutation, invalidate: `queryClient.invalidateQueries({ queryKey: ['stocks'] })`
- EAN detection (search pre-fill heuristic): `/^\d{8,14}$/`
- `unit_cost` is on `ledger_entries` but not exposed in UI yet
- `build` script uses `--webpack` flag; don't remove it
