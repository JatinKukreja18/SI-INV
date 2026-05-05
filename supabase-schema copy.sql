-- Run this in your Supabase SQL editor

-- Users table
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  password_hash text not null,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  created_at timestamptz default now()
);

-- Stock master table (current balance per item)
create table if not exists stock_items (
  id uuid primary key default gen_random_uuid(),
  item_code text unique not null,
  item_name text not null,
  current_qty numeric not null default 0,
  last_price numeric not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Ledger entries (every IN and OUT event)
create table if not exists ledger_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  item_code text not null references stock_items(item_code),
  item_name text not null,
  entry_type text not null check (entry_type in ('in', 'out')),
  qty numeric not null,
  unit_price numeric not null default 0,
  balance_after numeric not null,
  upload_batch_id uuid,
  created_by uuid references users(id),
  created_at timestamptz default now()
);

-- Upload batches (track each Excel upload)
create table if not exists upload_batches (
  id uuid primary key default gen_random_uuid(),
  upload_date date not null,
  filename text,
  total_items integer not null default 0,
  uploaded_by uuid references users(id),
  created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_ledger_date on ledger_entries(entry_date);
create index if not exists idx_ledger_code on ledger_entries(item_code);
create index if not exists idx_ledger_batch on ledger_entries(upload_batch_id);

-- Seed admin user (password: admin123 — change after first login)
-- bcrypt hash of "admin123"
insert into users (name, email, password_hash, role) values
  ('Admin', 'admin@store.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeAe0qMXqS.kqF7Jy', 'admin'),
  ('Staff User', 'staff@store.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeAe0qMXqS.kqF7Jy', 'staff')
on conflict (email) do nothing;
