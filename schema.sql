create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'room_status'
  ) then
    create type public.room_status as enum ('lobby', 'active', 'closed');
  end if;
end
$$;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code varchar(5) not null unique check (code ~ '^[A-Z0-9]{5}$'),
  name text not null,
  currency text not null default '€',
  default_buy_in numeric(12, 2) not null check (default_buy_in >= 0),
  status public.room_status not null default 'lobby',
  host_player_id uuid not null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  name text not null,
  initial_buy_in numeric(12, 2) not null check (initial_buy_in >= 0),
  final_amount numeric(12, 2),
  joined_at timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_by_device_id text,
  is_host boolean not null default false
);

alter table public.players
  add column if not exists claimed_at timestamptz;

alter table public.players
  add column if not exists claimed_by_device_id text;

create unique index if not exists players_room_id_name_unique_idx
  on public.players (room_id, lower(name));

create table if not exists public.rebuy_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  created_by_player_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  from_player_id uuid not null references public.players(id) on delete cascade,
  to_player_id uuid not null references public.players(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.dinner_expenses (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  paid_by_player_id uuid not null references public.players(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  description text not null default 'Cena',
  created_by_player_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists rooms_code_idx on public.rooms (code);
create index if not exists rooms_status_idx on public.rooms (status);
create index if not exists players_room_id_idx on public.players (room_id);
create index if not exists rebuy_events_room_id_idx on public.rebuy_events (room_id);
create index if not exists rebuy_events_player_id_idx on public.rebuy_events (player_id);
create index if not exists settlements_room_id_idx on public.settlements (room_id);
create index if not exists dinner_expenses_room_id_idx on public.dinner_expenses (room_id);
create index if not exists dinner_expenses_paid_by_player_id_idx on public.dinner_expenses (paid_by_player_id);

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.rebuy_events enable row level security;
alter table public.settlements enable row level security;
alter table public.dinner_expenses enable row level security;

drop policy if exists "rooms_select" on public.rooms;
create policy "rooms_select"
  on public.rooms
  for select
  using (true);

drop policy if exists "rooms_insert" on public.rooms;
create policy "rooms_insert"
  on public.rooms
  for insert
  with check (true);

drop policy if exists "rooms_update" on public.rooms;
create policy "rooms_update"
  on public.rooms
  for update
  using (true)
  with check (true);

drop policy if exists "rooms_delete" on public.rooms;
create policy "rooms_delete"
  on public.rooms
  for delete
  using (true);

drop policy if exists "players_select" on public.players;
create policy "players_select"
  on public.players
  for select
  using (true);

drop policy if exists "players_insert" on public.players;
create policy "players_insert"
  on public.players
  for insert
  with check (true);

drop policy if exists "players_update" on public.players;
create policy "players_update"
  on public.players
  for update
  using (true)
  with check (true);

drop policy if exists "players_delete" on public.players;
create policy "players_delete"
  on public.players
  for delete
  using (true);

drop policy if exists "rebuys_select" on public.rebuy_events;
create policy "rebuys_select"
  on public.rebuy_events
  for select
  using (true);

drop policy if exists "rebuys_insert" on public.rebuy_events;
create policy "rebuys_insert"
  on public.rebuy_events
  for insert
  with check (true);

drop policy if exists "rebuys_update" on public.rebuy_events;
create policy "rebuys_update"
  on public.rebuy_events
  for update
  using (true)
  with check (true);

drop policy if exists "settlements_select" on public.settlements;
create policy "settlements_select"
  on public.settlements
  for select
  using (true);

drop policy if exists "settlements_insert" on public.settlements;
create policy "settlements_insert"
  on public.settlements
  for insert
  with check (true);

drop policy if exists "settlements_update" on public.settlements;
create policy "settlements_update"
  on public.settlements
  for update
  using (true)
  with check (true);

drop policy if exists "settlements_delete" on public.settlements;
create policy "settlements_delete"
  on public.settlements
  for delete
  using (true);

drop policy if exists "dinner_expenses_select" on public.dinner_expenses;
create policy "dinner_expenses_select"
  on public.dinner_expenses
  for select
  using (true);

drop policy if exists "dinner_expenses_insert" on public.dinner_expenses;
create policy "dinner_expenses_insert"
  on public.dinner_expenses
  for insert
  with check (true);

drop policy if exists "dinner_expenses_update" on public.dinner_expenses;
create policy "dinner_expenses_update"
  on public.dinner_expenses
  for update
  using (true)
  with check (true);

drop policy if exists "dinner_expenses_delete" on public.dinner_expenses;
create policy "dinner_expenses_delete"
  on public.dinner_expenses
  for delete
  using (true);

comment on column public.rooms.host_player_id is
  'Client-managed reference to the host player. Kept as UUID instead of a foreign key to allow room creation before player insert.';

do $$
begin
  alter publication supabase_realtime add table public.rooms;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.players;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.rebuy_events;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter publication supabase_realtime add table public.dinner_expenses;
exception
  when duplicate_object then null;
end
$$;
