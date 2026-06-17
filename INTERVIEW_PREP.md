# SI Inventory — Interview Q&A

---

## Architecture & Design Decisions

---

**Q: Why did you use Next.js App Router instead of Pages Router?**

App Router gives you React Server Components by default — pages that run only on the server, with zero JS sent to the browser for the shell. This means auth checks, layout rendering, and initial HTML happen server-side without a client-side fetch waterfall. It also lets you co-locate API-like logic (server actions, server components) right next to your UI. Pages Router still works but it's the legacy model — App Router is where the Next.js ecosystem is going.

---

**Q: Why split every page into a server component + `*Client.tsx` — what does that buy you?**

The server component (`page.tsx`) can be async, read env vars, and do auth checks without exposing anything to the browser. The `*Client.tsx` file gets `'use client'` and owns all interactivity — hooks, state, event handlers.

The pattern keeps the boundary explicit: if something needs `useState` or `useEffect`, it goes in the client file. If something is just rendering markup with no interaction, it can stay server-side. In this project, every dashboard page is interactive so the client files do the heavy lifting, but the server component still controls whether the page renders at all (e.g., redirect to `/login` if no session).

---

**Q: Why no UI component library like Shadcn or MUI?**

Tradeoffs:
- **Pro of no library**: Full control over every pixel, no fighting the library's opinions, no bundle bloat from unused components, no version-lock risk.
- **Con**: You write every button, input, modal, and table from scratch. Inconsistencies creep in if you're not disciplined.

For this project, the UI is simple and consistent enough that custom Tailwind works well. A library like Shadcn would have been reasonable too — it's headless and doesn't force a design system on you. MUI would have been overkill and harder to customize.

---

**Q: Why does all database access go through API routes instead of calling Supabase directly from the client?**

Two reasons:

1. **Security**: The Supabase `service_role` key (used by `supabaseAdmin`) bypasses Row Level Security and has full read/write access to every table. If you expose it to the browser, anyone who opens devtools can steal it and query or modify your entire database. It must stay server-side only.

2. **Auth enforcement**: Our permission logic lives in the API routes — session check, role check, Zod validation. If clients called Supabase directly, you'd have to replicate all that in RLS policies, which is harder to reason about and test.

---

**Q: Why use the Supabase admin client (`service_role`) instead of per-user RLS?**

RLS (Row Level Security) works by attaching the user's JWT to each Supabase request — Supabase then filters rows based on policies you define in SQL. That's a valid pattern, but it adds complexity: you need to write and maintain Postgres policies, and debug them when they go wrong.

Since all our DB access already goes through Next.js API routes that enforce auth and roles in TypeScript, there's no need to duplicate that logic in SQL. The service_role client trusts our server code completely, which is appropriate because the service key never leaves the server.

---

## Authentication

---

**Q: Walk me through how a user logs in — end to end.**

1. User submits the login form at `/login` with email + password.
2. next-auth's `signIn('credentials', { email, password })` fires.
3. The `CredentialsProvider.authorize` function runs on the server:
   - Queries the `users` table via `supabaseAdmin` for that email.
   - Calls `bcrypt.compare(password, user.password_hash)` — bcrypt is slow by design to resist brute-force.
   - If valid, returns `{ id, name, email, role }`.
4. next-auth calls the `jwt` callback, which writes `id` and `role` onto the JWT token.
5. The token is stored in an httpOnly cookie — never readable by JavaScript.
6. On subsequent requests, next-auth calls the `session` callback to copy `id` and `role` from the token onto `session.user`.
7. API routes call `getServerAuthSession()` to read that session.

---

**Q: What's the difference between the `jwt` callback and the `session` callback?**

- `jwt` runs when the token is first created (login) or refreshed. It's where you write custom fields (like `role`) onto the raw JWT payload.
- `session` runs every time a client reads the session (e.g., `useSession()` or `getServerSession()`). It shapes the `session` object the app actually uses — you copy fields from `token` to `session.user` here.

Without the `jwt` callback, `role` would never be in the token. Without the `session` callback, `session.user.role` would be `undefined` even if the token had it.

---

**Q: Why JWT strategy instead of database sessions?**

Database sessions store session data in a table and validate on every request by hitting the DB. JWT sessions are stateless — the token is self-contained and verified with a secret. 

For this app: fewer DB queries per request, simpler infrastructure (no sessions table to manage or clean up). The downside is you can't immediately revoke a session (you'd have to wait for the JWT to expire). That's acceptable here since it's an internal business tool.

---

**Q: How do you enforce role-based access?**

Two layers:

1. **Route level** — every API route calls `getServerAuthSession()`. If no session → 401. If wrong role → 403. Example from `POST /api/stock`:
   ```ts
   if (session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
   ```

2. **UI level** — admin-only controls (like inline editing in batch history) conditionally render based on `session.user.role`. This is UI-only protection; the API is the real enforcement.

---

**Q: What happens if someone calls `POST /api/stock` without being logged in? Without being admin?**

- No session → `getServerAuthSession()` returns null → `return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })`
- Has session but role is `'staff'` → `session.user.role !== 'admin'` is true → `return NextResponse.json({ error: 'Forbidden' }, { status: 403 })`

The RPC never gets called in either case.

---

## State Management & Data Fetching

---

**Q: Why React Query over SWR or plain `useEffect` + fetch?**

React Query gives you:
- **Shared cache by query key** — multiple components subscribing to `['stocks']` share the same fetch, no duplicate requests.
- **`invalidateQueries`** — after a mutation, you can tell every subscriber to refetch. With plain `useEffect`, you'd have to lift state or use a context/store.
- **Loading/error states built in** — `isLoading`, `isError` come for free.
- **Background refetching, stale-while-revalidate** — data stays fresh without manual polling.

SWR is similar but less full-featured (no query-level invalidation, weaker mutation patterns). Plain `useEffect` + fetch works but you end up rebuilding all of the above manually.

---

**Q: What is `queryKey: ['stocks']` and why does it matter that multiple pages share the same key?**

The query key is React Query's cache identifier. Every `useQuery` call with the same key shares the same cached data and the same fetch. So:
- `DashboardPage` uses `['stocks']`
- `StockInClient` uses `['stocks']`
- When stock-in succeeds and calls `queryClient.invalidateQueries({ queryKey: ['stocks'] })`, **both** components refetch simultaneously.

If they used different keys, they'd have separate caches and you'd have to invalidate each one individually — or worse, one would show stale data.

---

**Q: After a stock-in mutation succeeds, how do other components know to refresh?**

```ts
queryClient.invalidateQueries({ queryKey: ['stocks'] })
```

This marks every query matching `['stocks']` as stale. React Query immediately refetches them if they have active subscribers (i.e., they're mounted). The `queryClient` is the single instance from `Providers`, shared across the entire app.

---

**Q: What's the risk of not calling `invalidateQueries` after a mutation?**

The UI shows stale data. After posting stock-in for 50 units of Item X, the dashboard would still show the old `current_qty` until the user manually refreshes. In a business context that means someone could re-order stock that already arrived or think they're out of stock when they're not.

---

## The Batch / RPC Design

---

**Q: Why is `post_inventory_batch` a single Postgres RPC instead of separate API calls?**

Atomicity. An inventory update involves two things:
1. Update `current_qty` in `stock_items`
2. Write a row in `ledger_entries`

If these were two separate API calls, a crash or network failure between them would leave the DB in an inconsistent state — stock updated but no ledger record, or vice versa. Inside a Postgres function, both operations are wrapped in the same transaction: either both commit or neither does.

---

**Q: What does "atomic" mean here and why does it matter for inventory?**

Atomic means "all or nothing" — the operation either completes fully or leaves zero trace. For inventory:
- Stock levels must always match what the ledger records
- If you post a 10-item batch and item 7 fails, rolling back to zero means you don't end up with a partial update that corrupts your stock count

The Postgres RPC handles this automatically via transaction semantics.

---

**Q: What happens when a stock-out batch has a shortage for one item?**

The entire batch is aborted — nothing is written to the DB. The RPC returns:
```json
{
  "success": false,
  "shortages": [
    { "item_code": "X", "requested_qty": 10, "available_qty": 3, "reason": "..." }
  ]
}
```

The UI shows the shortage details so the user can fix the quantities and re-submit. This prevents partial deductions that would make the inventory math wrong.

---

**Q: How does duplicate detection work for uploaded files?**

The `post_inventory_batch` RPC checks if an `upload_batches` row already exists with the same `filename` + `entry_date`. If one exists and `p_duplicate_override` is false, it returns a 409-level result with `duplicate: { batchId, filename, uploadDate }`. The client shows a warning. The user can re-submit with `allowDuplicate: true` to force it through. This prevents accidentally double-counting a sales file.

---

**Q: What's the difference between `stock_in` and `edit_out` batch types at the RPC level?**

| | `stock_in` | `edit_out` |
|---|---|---|
| Effect on `stock_items` | **Adds** qty (upserts — creates item if new) | **Subtracts** qty (item must exist) |
| Ledger entry type | `'in'` | `'out'` |
| Shortage check | No | Yes — aborts batch if any item is short |
| Duplicate check by filename | No | Yes |
| Creates new items | Yes | No |

The API routes themselves are nearly identical — they both call the same RPC, just with different `p_batch_type`.

---

## Excel Parsing

---

**Q: Walk me through what happens when a user uploads an Excel file on the stock-in page.**

1. `<input type="file">` triggers `handleFile`
2. `FileReader.readAsBinaryString` reads the file
3. `XLSX.read(result, { type: 'binary', cellDates: true })` parses the workbook
4. `XLSX.utils.sheet_to_json(worksheet, { header: 1 })` reads raw rows as arrays (not objects) — needed so `findHeaderRow` can score each row
5. `findHeaderRow(rawRows)` finds which row index has the most recognized column names
6. `XLSX.utils.sheet_to_json(worksheet, { range: headerRowIndex })` re-reads using that row as the header — now each row is an object like `{ "Item Code": "X01", "Qty": 5 }`
7. `normalizeSheetRows(rows)` maps fuzzy column names to `BatchItemInput` fields, skips invalid rows, deduplicates by `item_code`
8. For each parsed item, `mergeBatchItems` merges it into the existing items state (summing qty if the item was already in the list manually)

---

**Q: How does `findHeaderRow` work — why not just assume row 0 is the header?**

Real-world Excel files from suppliers often have:
- Company logos or titles in the first 1–5 rows
- Blank rows
- Subtotals or metadata rows before the actual data

`findHeaderRow` scores each of the first 20 rows by counting how many cells match a set of known column names (normalized — lowercased, whitespace/punctuation stripped). The row with the highest score is the header. It stops early if a row scores ≥ 3 matches. If no row scores ≥ 2, it defaults to row 0.

---

**Q: What problem does fuzzy column matching solve? Give an example.**

Different suppliers use different column names for the same field. Without fuzzy matching you'd need exact header names. With it:

| Supplier A | Supplier B | Supplier C | Maps to |
|---|---|---|---|
| `Item Code` | `ITEM CODE` | `Code` | `item_code` |
| `Quantity` | `QTY` | `Qty` | `qty` |
| `NET COST (WITH TAX)` | `Net Cost` | `Cost` | `unit_cost` |

`normalizeHeader` strips all spaces, underscores, parentheses, and lowercases — so `"NET COST (WITH TAX)"` becomes `"netcostwithtax"` which matches `"Net Cost"` → `"netcost"` (close but not exact). The actual matching uses the alias list to try multiple normalized variants.

---

**Q: What does `normalizeSheetRows` do when the same item code appears twice in the sheet?**

It uses a `Map<string, BatchItemInput>` keyed by `item_code`. On a duplicate:
- `qty` is summed
- `unit_price` is updated if the new value is non-zero
- `unit_cost` is updated if the new value is non-zero
- `ean_code` is updated if a new one is provided

This handles supplier sheets that list the same SKU on multiple lines (e.g., different sub-lots or tax lines).

---

**Q: What's the difference between `mergeBatchItems` and `normalizeSheetRows`?**

- `normalizeSheetRows` — processes raw spreadsheet rows into clean `BatchItemInput[]`, deduplicating within the file. It's used at parse time.
- `mergeBatchItems` — merges a single new item into the existing items array in component state. It's used when the user searches and selects an item manually, or when a parsed file's items are merged into items that were already in the batch.

`normalizeSheetRows` handles dedup within one file. `mergeBatchItems` handles merging across sources (manual entry + file upload, or multiple file uploads).

---

## React Patterns & Performance

---

**Q: Why is `useMemo` used in `DayLedgerClient` for the pivot table?**

The pivot computation iterates over all ledger entries and builds a `Map` — O(n) work. Without `useMemo`, it would re-run on every render, including renders triggered by the margin-toggle button. With `useMemo([entries])`, it only re-runs when the underlying data changes. The margin toggle only changes `marginAsPercent`, which triggers a re-render but not a re-pivot — `useMemo` short-circuits and returns the cached rows.

---

**Q: Why is `queryClient` created inside `useState` in `Providers`?**

```ts
const [queryClient] = useState(() => new QueryClient())
```

If you wrote `const queryClient = new QueryClient()` outside `useState`, it would be recreated on every render of `Providers`, destroying the cache each time. `useState` with an initializer runs the factory only once per component mount — so `queryClient` is stable for the lifetime of the app. It's also important for SSR: `useState` ensures each request gets its own client instance rather than sharing one across requests.

---

**Q: The search dropdown uses `onMouseDown` instead of `onClick` — why?**

When you click a dropdown item, the sequence is: `mousedown` → `blur` (on the input) → `mouseup` → `click`. The input has an `onBlur` that closes the dropdown with a 150ms delay. But without the delay, `blur` fires before `click`, the dropdown closes, and the click never lands on the item.

`onMouseDown` fires before `blur`, so the item selection logic runs before the dropdown closes. The 150ms `setTimeout` on `onBlur` is a backup for cases where you need the dropdown to close when focus leaves, but it's the `onMouseDown` that makes item selection reliable.

---

**Q: How does the name-conflict resolution work?**

When the batch is being built, `StockInClient` compares each item's `item_name` against what's in the `stockMap` (cached from `['stocks']` query). If they differ, the item is added to `nameMismatches`. The UI renders a radio group per conflicted item: "From entry" (incoming name) or "In stock master" (DB name). The user's choice is stored in `nameResolutions: Record<item_code, 'incoming' | 'existing'>`. On save, `resolvedItems` is computed — if a user chose `'existing'`, that item's name is replaced with the DB name before sending to the API.

---

## Database / Supabase

---

**Q: What does `balance_after` on `ledger_entries` represent and why store it redundantly?**

`balance_after` is the `current_qty` of the item immediately after this ledger entry was applied. It's technically derivable by replaying all entries in order, but storing it directly makes queries fast — you can show "balance at any point in time" with a simple `SELECT` instead of a window function over all history. It's a classic denormalization tradeoff: redundant storage for read performance.

---

**Q: `unit_cost` is on `ledger_entries` but not in the UI — how would you add it?**

The data is already there for `edit_out` entries. To expose it:
1. Add `unit_cost` to the `LedgerEntry` type display in `ItemLedgerClient` — add a column to the table definition
2. In `DayLedgerClient`, the pivot already uses `unit_cost` for margin calculation — it just isn't shown as its own column
3. On the stock-in form, the `batchItemSchema` already accepts `unit_cost` — you'd add an input field to the inline table and the Excel parser already extracts it

No schema change needed — it's purely a UI gap.

---

**Q: What's the difference between `stock_items` and `ledger_entries`?**

- `stock_items` is the **current state** — one row per SKU, always reflects the live quantity. Think of it as a running total.
- `ledger_entries` is the **history** — one row per transaction (each individual stock-in or sale). It's an append-only log.

`stock_items.current_qty` is always equal to the sum of all `ledger_entries` for that item (positive for `in`, negative for `out`). The RPC keeps them in sync atomically.

---

**Q: How would you handle `current_qty` in `stock_items` drifting out of sync with the ledger?**

This can happen if someone manually edits the DB outside the app. Recovery options:

1. **Recompute** — write a SQL query: `UPDATE stock_items SET current_qty = (SELECT SUM(CASE WHEN entry_type='in' THEN qty ELSE -qty END) FROM ledger_entries WHERE item_code = stock_items.item_code)`
2. **Prevent** — add a Postgres trigger on `ledger_entries` that updates `stock_items.current_qty` on every insert/update/delete, making it impossible to drift
3. **Detect** — add an audit endpoint that compares `current_qty` against the ledger sum and reports mismatches

The current design relies on all writes going through `post_inventory_batch`, which keeps them in sync by construction.

---

## End-to-End Flows (Be Ready to Narrate These)

---

**Full request lifecycle: user clicks "Save Stock-In"**

1. `save()` in `StockInClient` fires
2. `resolvedItems` built — name conflicts resolved per `nameResolutions`
3. `fetch('/api/stock', { method: 'POST', body: JSON.stringify({ date, items }) })`
4. API route: `getServerAuthSession()` → 401 if no session
5. Role check → 403 if not admin
6. `stockInPayloadSchema.safeParse(body)` → 400 if invalid
7. `supabaseAdmin.rpc('post_inventory_batch', { p_batch_type: 'stock_in', ... })`
8. Postgres: upserts each item in `stock_items`, writes `ledger_entries`, commits
9. Returns `BatchOperationResult` JSON
10. `parseBatchResponse(response)` normalizes the result with safe defaults
11. `toast.success(...)` or `toast.error(...)`
12. `queryClient.invalidateQueries({ queryKey: ['stocks'] })` → dashboard + stock-in search both refresh

---

**Excel upload flow: file picked → data on screen → confirmed → DB**

1. File picker triggers `handleFile`
2. `FileReader` reads binary string → `XLSX.read` parses workbook
3. `findHeaderRow` scores first 20 rows → finds header index
4. `XLSX.utils.sheet_to_json` re-reads with correct header offset
5. `normalizeSheetRows` → `BatchItemInput[]` (deduped, typed)
6. Each item passed through `mergeBatchItems` into component state → table renders
7. User reviews, edits inline if needed
8. `buildUploadPreview` enriches with current stock and warnings (upload page only)
9. User clicks confirm → `POST /api/upload` → same RPC, `p_batch_type: 'edit_out'`
10. Shortage → 409, duplicate → 409 with override option, success → table clears

---

**Day ledger pivot: raw entries → merged rows**

1. `useQuery(['ledger', 'day', date])` fetches `LedgerEntry[]` from `/api/stock/ledger?type=day&date=X`
2. `useMemo` sorts entries by `created_at` (chronological order matters for `balance_after`)
3. Iterates entries, builds `Map<item_code, MergedDayRow>`
4. Each `'in'` entry adds to `stock_in` and sets `in_price`
5. Each `'out'` entry adds to `sale_out`, sets `out_price` and `unit_cost`
6. `balance_after` always gets the latest value (last entry for that item wins)
7. Map values → array → rendered in `DataTable`
8. Margin column toggles between `(out_price - unit_cost) / out_price * 100` (%) and `(out_price - unit_cost) * sale_out` (absolute ₹)
