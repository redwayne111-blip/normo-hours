-- Схема Supabase (PostgreSQL) для «Нормо-часов».
-- Выполните в SQL Editor проекта Supabase. Все таблицы защищены RLS: пользователь видит только свои строки.
-- Суммы — numeric(14,2), AW и часы — numeric(10,2): без ошибок плавающей точки.

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  number text not null default '',
  brand text not null default '',
  model text not null default '',
  plate text not null default '',
  date date not null,
  aw numeric(10,2) not null default 0,
  hours numeric(10,2),
  earnings numeric(14,2) not null default 0,
  comment text not null default '',
  status text not null default 'confirmed' check (status in ('confirmed','draft','cancelled')),
  photo_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_user_date on public.orders (user_id, date);

create table if not exists public.order_jobs (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  title text not null,
  position int not null default 0
);

create table if not exists public.work_schedule (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  status text not null check (status in ('work','off','vacation','unpaid')),
  primary key (user_id, date)
);

create table if not exists public.salary_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.salary_adjustments (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  title text not null,
  amount numeric(14,2) not null
);

create table if not exists public.attachments (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  path text not null,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['users','orders','order_jobs','work_schedule','salary_settings','salary_adjustments','attachments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    if t = 'users' then
      execute 'create policy "own rows" on public.users for all using (id = auth.uid()) with check (id = auth.uid())';
    else
      execute format('create policy "own rows" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    end if;
  end loop;
end $$;

-- Приватное хранилище фотографий заказ-нарядов: файлы лежат в папке <user_id>/.
insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false) on conflict do nothing;
drop policy if exists "own files" on storage.objects;
create policy "own files" on storage.objects for all
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
