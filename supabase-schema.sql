-- Run this in your Supabase SQL editor
create extension if not exists pgcrypto;

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

-- Upload batches (track each stock posting batch)
create table if not exists upload_batches (
  id uuid primary key default gen_random_uuid(),
  upload_date date not null,
  batch_type text not null default 'edit_out' check (batch_type in ('stock_in', 'edit_out')),
  filename text,
  total_items integer not null default 0,
  uploaded_by uuid references users(id),
  duplicate_override boolean not null default false,
  created_at timestamptz default now()
);

alter table upload_batches add column if not exists batch_type text not null default 'edit_out';
alter table upload_batches add column if not exists duplicate_override boolean not null default false;

alter table upload_batches
  drop constraint if exists upload_batches_batch_type_check;

alter table upload_batches
  add constraint upload_batches_batch_type_check
  check (batch_type in ('stock_in', 'edit_out'));

-- Indexes
create index if not exists idx_ledger_date on ledger_entries(entry_date);
create index if not exists idx_ledger_code on ledger_entries(item_code);
create index if not exists idx_ledger_batch on ledger_entries(upload_batch_id);
create index if not exists idx_upload_batches_lookup on upload_batches(batch_type, upload_date, filename);

create or replace function post_inventory_batch(
  p_batch_type text,
  p_entry_date date,
  p_filename text,
  p_items jsonb,
  p_created_by uuid,
  p_duplicate_override boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_duplicate_batch_id uuid;
  v_errors jsonb := '[]'::jsonb;
  v_shortages jsonb := '[]'::jsonb;
  v_posted_items jsonb := '[]'::jsonb;
  v_row jsonb;
  v_existing stock_items%rowtype;
  v_previous_qty numeric;
  v_new_qty numeric;
  v_item_code text;
  v_item_name text;
  v_qty numeric;
  v_price numeric;
begin
  if p_batch_type not in ('stock_in', 'edit_out') then
    raise exception 'Unsupported batch type: %', p_batch_type;
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object(
      'success', false,
      'savedCount', 0,
      'errors', jsonb_build_array('No items provided.'),
      'shortages', '[]'::jsonb,
      'postedItems', '[]'::jsonb
    );
  end if;

  if p_batch_type = 'edit_out' and coalesce(p_filename, '') <> '' and not p_duplicate_override then
    select id
      into v_duplicate_batch_id
      from upload_batches
     where batch_type = p_batch_type
       and upload_date = p_entry_date
       and filename = p_filename
     order by created_at desc
     limit 1;

    if v_duplicate_batch_id is not null then
      return jsonb_build_object(
        'success', false,
        'savedCount', 0,
        'errors', jsonb_build_array('A batch with the same filename and date already exists.'),
        'shortages', '[]'::jsonb,
        'postedItems', '[]'::jsonb,
        'duplicate', jsonb_build_object(
          'batchId', v_duplicate_batch_id,
          'filename', p_filename,
          'uploadDate', p_entry_date
        )
      );
    end if;
  end if;

  for v_row in select value from jsonb_array_elements(p_items)
  loop
    v_item_code := btrim(coalesce(v_row->>'item_code', ''));
    v_item_name := btrim(coalesce(v_row->>'item_name', ''));
    v_qty := coalesce((v_row->>'qty')::numeric, 0);

    if v_item_code = '' or v_item_name = '' or v_qty <= 0 then
      v_errors := v_errors || jsonb_build_array(format('Invalid row for item code "%s".', v_item_code));
    end if;
  end loop;

  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object(
      'success', false,
      'savedCount', 0,
      'errors', v_errors,
      'shortages', '[]'::jsonb,
      'postedItems', '[]'::jsonb
    );
  end if;

  if p_batch_type = 'edit_out' then
    for v_item_code, v_item_name, v_qty in
      select
        btrim(coalesce(value->>'item_code', '')) as item_code,
        max(btrim(coalesce(value->>'item_name', ''))) as item_name,
        sum(coalesce((value->>'qty')::numeric, 0)) as total_qty
      from jsonb_array_elements(p_items)
      group by 1
    loop
      select *
        into v_existing
        from stock_items
       where item_code = v_item_code
       for update;

      if not found then
        v_shortages := v_shortages || jsonb_build_array(jsonb_build_object(
          'item_code', v_item_code,
          'item_name', v_item_name,
          'requested_qty', v_qty,
          'available_qty', 0,
          'reason', 'Not in stock master'
        ));
      elsif v_existing.current_qty < v_qty then
        v_shortages := v_shortages || jsonb_build_array(jsonb_build_object(
          'item_code', v_item_code,
          'item_name', v_item_name,
          'requested_qty', v_qty,
          'available_qty', v_existing.current_qty,
          'reason', format('Only %s in stock', v_existing.current_qty)
        ));
      end if;
    end loop;

    if jsonb_array_length(v_shortages) > 0 then
      return jsonb_build_object(
        'success', false,
        'savedCount', 0,
        'errors', jsonb_build_array('This batch would reduce one or more items below zero.'),
        'shortages', v_shortages,
        'postedItems', '[]'::jsonb
      );
    end if;
  end if;

  insert into upload_batches (
    upload_date,
    batch_type,
    filename,
    total_items,
    uploaded_by,
    duplicate_override
  ) values (
    p_entry_date,
    p_batch_type,
    p_filename,
    jsonb_array_length(p_items),
    p_created_by,
    p_duplicate_override
  )
  returning id into v_batch_id;

  for v_row in select value from jsonb_array_elements(p_items)
  loop
    v_item_code := btrim(coalesce(v_row->>'item_code', ''));
    v_item_name := btrim(coalesce(v_row->>'item_name', ''));
    v_qty := coalesce((v_row->>'qty')::numeric, 0);
    v_price := coalesce((v_row->>'unit_price')::numeric, 0);

    if p_batch_type = 'stock_in' then
      insert into stock_items (
        item_code,
        item_name,
        current_qty,
        last_price,
        updated_at
      ) values (
        v_item_code,
        v_item_name,
        v_qty,
        v_price,
        now()
      )
      on conflict (item_code)
      do update
        set item_name = excluded.item_name,
            current_qty = stock_items.current_qty + excluded.current_qty,
            last_price = excluded.last_price,
            updated_at = now()
      returning current_qty - v_qty, current_qty into v_previous_qty, v_new_qty;

      insert into ledger_entries (
        entry_date,
        item_code,
        item_name,
        entry_type,
        qty,
        unit_price,
        balance_after,
        upload_batch_id,
        created_by
      ) values (
        p_entry_date,
        v_item_code,
        v_item_name,
        'in',
        v_qty,
        v_price,
        v_new_qty,
        v_batch_id,
        p_created_by
      );
    else
      update stock_items
         set current_qty = current_qty - v_qty,
             item_name = v_item_name,
             last_price = v_price,
             updated_at = now()
       where item_code = v_item_code
       returning current_qty + v_qty, current_qty into v_previous_qty, v_new_qty;

      insert into ledger_entries (
        entry_date,
        item_code,
        item_name,
        entry_type,
        qty,
        unit_price,
        balance_after,
        upload_batch_id,
        created_by
      ) values (
        p_entry_date,
        v_item_code,
        v_item_name,
        'out',
        v_qty,
        v_price,
        v_new_qty,
        v_batch_id,
        p_created_by
      );
    end if;

    v_posted_items := v_posted_items || jsonb_build_array(jsonb_build_object(
      'item_code', v_item_code,
      'item_name', v_item_name,
      'qty', v_qty,
      'unit_price', v_price,
      'previous_qty', v_previous_qty,
      'new_qty', v_new_qty,
      'entry_type', case when p_batch_type = 'stock_in' then 'in' else 'out' end
    ));
  end loop;

  return jsonb_build_object(
    'success', true,
    'batchId', v_batch_id,
    'savedCount', jsonb_array_length(v_posted_items),
    'errors', '[]'::jsonb,
    'shortages', '[]'::jsonb,
    'postedItems', v_posted_items
  );
end;
$$;

-- Create users manually with strong passwords.
-- Example:
-- insert into users (name, email, password_hash, role)
-- values ('Admin User', 'admin@example.com', '<bcrypt-hash>', 'admin');
