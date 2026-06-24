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
  data_scope text not null default 'demo' check (data_scope in ('live', 'demo')),
  item_code text not null,
  item_name text not null,
  current_qty numeric not null default 0,
  last_price numeric not null default 0,
  ean_code text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table stock_items add column if not exists ean_code text;
alter table stock_items add column if not exists data_scope text not null default 'demo';
alter table stock_items
  drop constraint if exists stock_items_data_scope_check;
alter table stock_items
  add constraint stock_items_data_scope_check
  check (data_scope in ('live', 'demo'));
alter table stock_items
  drop constraint if exists stock_items_item_code_key cascade;
alter table stock_items
  drop constraint if exists stock_items_data_scope_item_code_key cascade;
alter table stock_items
  add constraint stock_items_data_scope_item_code_key
  unique (data_scope, item_code);

-- Ledger entries (every IN and OUT event)
create table if not exists ledger_entries (
  id uuid primary key default gen_random_uuid(),
  data_scope text not null default 'demo' check (data_scope in ('live', 'demo')),
  entry_date date not null,
  item_code text not null,
  item_name text not null,
  entry_type text not null check (entry_type in ('in', 'out')),
  qty numeric not null,
  unit_price numeric not null default 0,
  balance_after numeric not null,
  upload_batch_id uuid,
  created_by uuid references users(id),
  created_at timestamptz default now()
);
alter table ledger_entries add column if not exists data_scope text not null default 'demo';
alter table ledger_entries
  drop constraint if exists ledger_entries_data_scope_check;
alter table ledger_entries
  add constraint ledger_entries_data_scope_check
  check (data_scope in ('live', 'demo'));
alter table ledger_entries
  drop constraint if exists ledger_entries_item_code_fkey;
alter table ledger_entries
  drop constraint if exists ledger_entries_data_scope_item_code_fkey;
alter table ledger_entries
  add constraint ledger_entries_data_scope_item_code_fkey
  foreign key (data_scope, item_code)
  references stock_items(data_scope, item_code);

-- Upload batches (track each stock posting batch)
create table if not exists upload_batches (
  id uuid primary key default gen_random_uuid(),
  data_scope text not null default 'demo' check (data_scope in ('live', 'demo')),
  upload_date date not null,
  batch_type text not null default 'edit_out' check (batch_type in ('stock_in', 'edit_out')),
  filename text,
  total_items integer not null default 0,
  uploaded_by uuid references users(id),
  duplicate_override boolean not null default false,
  created_at timestamptz default now()
);
alter table upload_batches add column if not exists data_scope text not null default 'demo';
alter table upload_batches
  drop constraint if exists upload_batches_data_scope_check;
alter table upload_batches
  add constraint upload_batches_data_scope_check
  check (data_scope in ('live', 'demo'));

alter table upload_batches add column if not exists batch_type text not null default 'edit_out';
alter table upload_batches add column if not exists duplicate_override boolean not null default false;

alter table upload_batches
  drop constraint if exists upload_batches_batch_type_check;

alter table upload_batches
  add constraint upload_batches_batch_type_check
  check (batch_type in ('stock_in', 'edit_out'));

alter table ledger_entries add column if not exists unit_cost numeric not null default 0;

-- Indexes
drop index if exists idx_ledger_date;
drop index if exists idx_ledger_code;
drop index if exists idx_ledger_batch;
drop index if exists idx_upload_batches_lookup;
create index if not exists idx_ledger_date on ledger_entries(data_scope, entry_date);
create index if not exists idx_ledger_code on ledger_entries(data_scope, item_code);
create index if not exists idx_ledger_batch on ledger_entries(data_scope, upload_batch_id);
create index if not exists idx_upload_batches_lookup on upload_batches(data_scope, batch_type, upload_date, filename);

drop function if exists post_inventory_batch(text, date, text, jsonb, uuid, boolean);
create or replace function post_inventory_batch(
  p_data_scope text,
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
  v_cost numeric;
begin
  if p_data_scope not in ('live', 'demo') then
    raise exception 'Unsupported data scope: %', p_data_scope;
  end if;

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
       and data_scope = p_data_scope
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
       where data_scope = p_data_scope
         and item_code = v_item_code
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
    data_scope,
    upload_date,
    batch_type,
    filename,
    total_items,
    uploaded_by,
    duplicate_override
  ) values (
    p_data_scope,
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
    v_cost := coalesce((v_row->>'unit_cost')::numeric, 0);

    if p_batch_type = 'stock_in' then
      insert into stock_items (
        data_scope,
        item_code,
        item_name,
        current_qty,
        last_price,
        ean_code,
        updated_at
      ) values (
        p_data_scope,
        v_item_code,
        v_item_name,
        v_qty,
        v_price,
        nullif(btrim(coalesce(v_row->>'ean_code', '')), ''),
        now()
      )
      on conflict (data_scope, item_code)
      do update
        set item_name = excluded.item_name,
            current_qty = stock_items.current_qty + excluded.current_qty,
            last_price = excluded.last_price,
            ean_code = coalesce(excluded.ean_code, stock_items.ean_code),
            updated_at = now()
      returning current_qty - v_qty, current_qty into v_previous_qty, v_new_qty;

      insert into ledger_entries (
        data_scope,
        entry_date,
        item_code,
        item_name,
        entry_type,
        qty,
        unit_price,
        unit_cost,
        balance_after,
        upload_batch_id,
        created_by
      ) values (
        p_data_scope,
        p_entry_date,
        v_item_code,
        v_item_name,
        'in',
        v_qty,
        v_price,
        v_cost,
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
       where data_scope = p_data_scope
         and item_code = v_item_code
       returning current_qty + v_qty, current_qty into v_previous_qty, v_new_qty;

      insert into ledger_entries (
        data_scope,
        entry_date,
        item_code,
        item_name,
        entry_type,
        qty,
        unit_price,
        unit_cost,
        balance_after,
        upload_batch_id,
        created_by
      ) values (
        p_data_scope,
        p_entry_date,
        v_item_code,
        v_item_name,
        'out',
        v_qty,
        v_price,
        v_cost,
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

drop function if exists update_stock_in_batch(uuid, jsonb);
create or replace function update_stock_in_batch(
  p_data_scope text,
  p_batch_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch upload_batches%rowtype;
  v_expected_count integer;
  v_actual_count integer;
  v_invalid_balances jsonb := '[]'::jsonb;
begin
  if p_data_scope not in ('live', 'demo') then
    raise exception 'Unsupported data scope: %', p_data_scope;
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object(
      'success', false,
      'errors', jsonb_build_array('No batch items provided.')
    );
  end if;

  select *
    into v_batch
    from upload_batches
   where id = p_batch_id
     and data_scope = p_data_scope
     and batch_type = 'stock_in'
   for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'errors', jsonb_build_array('Stock-in batch not found.')
    );
  end if;

  v_expected_count := jsonb_array_length(p_items);

  create temporary table tmp_batch_updates (
    entry_id uuid primary key,
    data_scope text not null,
    item_code text not null,
    old_qty numeric not null,
    new_qty numeric not null,
    unit_price numeric not null,
    item_name text not null
  ) on commit drop;

  insert into tmp_batch_updates (entry_id, data_scope, item_code, old_qty, new_qty, unit_price, item_name)
  select
    le.id,
    le.data_scope,
    le.item_code,
    le.qty,
    updated.qty,
    updated.unit_price,
    btrim(updated.item_name)
  from jsonb_to_recordset(p_items) as updated(
    entry_id uuid,
    qty numeric,
    unit_price numeric,
    item_name text
  )
  join ledger_entries le
    on le.id = updated.entry_id
   and le.data_scope = p_data_scope
   and le.upload_batch_id = p_batch_id
   and le.entry_type = 'in'
  where updated.qty > 0
    and updated.unit_price >= 0
    and btrim(coalesce(updated.item_name, '')) <> '';

  get diagnostics v_actual_count = row_count;

  if v_actual_count <> v_expected_count then
    return jsonb_build_object(
      'success', false,
      'errors', jsonb_build_array('One or more batch rows are invalid, duplicated, or do not belong to this stock-in batch.')
    );
  end if;

  create temporary table tmp_affected_items (
    item_code text primary key
  ) on commit drop;

  insert into tmp_affected_items (item_code)
  select distinct item_code
  from tmp_batch_updates;

  with prospective_entries as (
    select
      le.id,
      le.item_code,
      le.item_name,
      le.entry_type,
      le.entry_date,
      le.created_at,
      coalesce(tbu.new_qty, le.qty) as effective_qty
    from ledger_entries le
    left join tmp_batch_updates tbu
      on tbu.entry_id = le.id
    where le.data_scope = p_data_scope
      and le.item_code in (select item_code from tmp_affected_items)
  ),
  balances as (
    select
      id,
      item_code,
      item_name,
      entry_type,
      entry_date,
      sum(
        case
          when entry_type = 'in' then effective_qty
          else -effective_qty
        end
      ) over (
        partition by item_code
        order by entry_date, created_at, id
      ) as running_balance
    from prospective_entries
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'item_code', item_code,
        'item_name', item_name,
        'entry_date', entry_date,
        'balance_after', running_balance
      )
      order by entry_date, id
    ),
    '[]'::jsonb
  )
    into v_invalid_balances
  from balances
  where running_balance < 0;

  if jsonb_array_length(v_invalid_balances) > 0 then
    return jsonb_build_object(
      'success', false,
      'errors', jsonb_build_array('This edit would make inventory go negative for one or more historical ledger rows.'),
      'invalidBalances', v_invalid_balances
    );
  end if;

  update ledger_entries le
     set qty = tbu.new_qty,
         unit_price = tbu.unit_price,
         item_name = tbu.item_name
    from tmp_batch_updates tbu
   where le.id = tbu.entry_id;

  with recomputed_balances as (
    select
      le.id,
      sum(
        case
          when le.entry_type = 'in' then le.qty
          else -le.qty
        end
      ) over (
        partition by le.item_code
        order by le.entry_date, le.created_at, le.id
      ) as running_balance
    from ledger_entries le
    where le.data_scope = p_data_scope
      and le.item_code in (select item_code from tmp_affected_items)
  )
  update ledger_entries le
     set balance_after = rb.running_balance
    from recomputed_balances rb
   where le.id = rb.id;

  with latest_item_rows as (
    select distinct on (le.item_code)
      le.item_code,
      le.item_name,
      le.unit_price,
      le.balance_after
    from ledger_entries le
    where le.data_scope = p_data_scope
      and le.item_code in (select item_code from tmp_affected_items)
    order by le.item_code, le.entry_date desc, le.created_at desc, le.id desc
  )
  update stock_items si
     set current_qty = lir.balance_after,
         item_name = lir.item_name,
         last_price = lir.unit_price,
         updated_at = now()
    from latest_item_rows lir
   where si.data_scope = p_data_scope
     and si.item_code = lir.item_code;

  return jsonb_build_object(
    'success', true,
    'updatedCount', v_actual_count
  );
exception
  when unique_violation then
    return jsonb_build_object(
      'success', false,
      'errors', jsonb_build_array('Duplicate ledger entries were submitted in the same edit request.')
    );
  when others then
    return jsonb_build_object(
      'success', false,
      'errors', jsonb_build_array(sqlerrm)
    );
end;
$$;

-- Create users manually with strong passwords.
-- Example:
-- insert into users (name, email, password_hash, role)
-- values ('Admin User', 'admin@example.com', '<bcrypt-hash>', 'admin');
