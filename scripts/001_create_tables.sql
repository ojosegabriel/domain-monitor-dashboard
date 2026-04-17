
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);


create table if not exists public.domains (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  url text not null,
  status text not null default 'online' check (status in ('online', 'offline')),
  uptime numeric(5,2) not null default 100.00,
  check_interval integer not null default 5,
  last_check timestamptz default now(),
  created_at timestamptz default now()
);

alter table public.domains enable row level security;

create policy "domains_select_own" on public.domains for select using (auth.uid() = user_id);
create policy "domains_insert_own" on public.domains for insert with check (auth.uid() = user_id);
create policy "domains_update_own" on public.domains for update using (auth.uid() = user_id);
create policy "domains_delete_own" on public.domains for delete using (auth.uid() = user_id);


create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  domain_id uuid not null references public.domains(id) on delete cascade,
  domain_name text not null,
  domain_url text not null,
  type text not null check (type in ('down', 'recovered')),
  message text not null,
  created_at timestamptz default now()
);

alter table public.alerts enable row level security;

create policy "alerts_select_own" on public.alerts for select using (auth.uid() = user_id);
create policy "alerts_insert_own" on public.alerts for insert with check (auth.uid() = user_id);


create table if not exists public.uptime_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  hour text not null,
  uptime numeric(5,2) not null default 100.00,
  logged_at timestamptz default now()
);

alter table public.uptime_logs enable row level security;

create policy "uptime_logs_select_own" on public.uptime_logs for select using (auth.uid() = user_id);
create policy "uptime_logs_insert_own" on public.uptime_logs for insert with check (auth.uid() = user_id);
