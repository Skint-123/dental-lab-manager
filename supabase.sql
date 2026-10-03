-- 1) Создай бесплатный проект Supabase.
-- 2) Открой SQL Editor и выполни этот файл целиком.
-- 3) В приложении вставь Project URL и anon/public key.
-- ВАЖНО: anon key можно использовать в браузере; service_role key сюда НЕ вставляй.

create extension if not exists pgcrypto;

create table if not exists public.prices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  price numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client text default '',
  date date not null default current_date,
  items jsonb not null default '[]'::jsonb,
  total_usd numeric(12,2) not null default 0,
  total_uzs numeric(18,2) not null default 0,
  rate numeric(18,4) not null default 12000,
  status text not null default 'Не оплачено',
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  id uuid primary key references auth.users(id) on delete cascade,
  rate numeric(18,4) not null default 12000,
  lab_name text not null default 'Моя зуботехническая лаборатория'
);

alter table public.prices enable row level security;
alter table public.clients enable row level security;
alter table public.orders enable row level security;
alter table public.settings enable row level security;

drop policy if exists prices_all on public.prices;
create policy prices_all on public.prices for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists clients_all on public.clients;
create policy clients_all on public.clients for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists orders_all on public.orders;
create policy orders_all on public.orders for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists settings_all on public.settings;
create policy settings_all on public.settings for all using (auth.uid() = id) with check (auth.uid() = id);

-- Для realtime включи таблицы в Database -> Replication:
-- prices, clients, orders, settings
