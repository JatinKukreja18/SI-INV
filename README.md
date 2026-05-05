# StockLedger

Inventory and edit-out tracking app for supplier stock-ins, Excel-based end-of-day edit-outs, and item/day ledger review.

## What It Does

- Admin can post stock-in batches, view the full ledger, and review upload batch history.
- Staff can upload edit-out Excel files and view leftover stock.
- Edit-out uploads validate before posting:
  - unknown item codes are blocked
  - shortages are blocked
  - duplicate file/date uploads require an explicit override
- Batch posting is handled by a single Supabase SQL function so the ledger and stock update together.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` from `env.local.example` and fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
```

3. Run the SQL in [supabase-schema.sql](/Users/kukreja/Projects/Asiana/SI-Inventory/supabase-schema.sql) inside the Supabase SQL editor.

4. Manually create at least one admin user and one staff user in the `users` table using bcrypt password hashes.

5. Start the app:

```bash
npm run dev
```

6. Verify production build:

```bash
npm run build
```

## Deployment Notes

- Production builds use `next build --webpack` because Turbopack native bindings were unavailable in this environment.
- Point `NEXTAUTH_URL` at your live domain, for example `https://inv.sekaiichiba.com`.
- Run the SQL schema updates in production Supabase before deploying the app.

## Testing Checklist

- Admin can sign in and post a stock-in batch.
- Staff can sign in and upload an edit-out file.
- A batch with insufficient stock is rejected with shortage details.
- Re-uploading the same file and date shows the duplicate override warning.
- Staff cannot open `/stock-in`, `/ledger/item`, `/ledger/day`, or call the ledger API successfully.
