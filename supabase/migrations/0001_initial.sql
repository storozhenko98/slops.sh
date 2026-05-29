create extension if not exists pgcrypto;
create extension if not exists citext;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  starting_balance integer not null default 1000 check (starting_balance >= 0),
  current_balance integer not null default 1000 check (current_balance >= 0),
  peak_balance integer not null default 1000 check (peak_balance >= 0),
  status text not null default 'active' check (status in ('active', 'busted', 'cashed_out')),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create unique index if not exists runs_one_active_per_user
  on public.runs(user_id)
  where status = 'active';

create index if not exists runs_leaderboard_idx
  on public.runs(peak_balance desc, created_at asc);

create table if not exists public.spins (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  nonce text not null,
  symbols text[] not null check (array_length(symbols, 1) = 3),
  outcome text not null,
  wager integer not null check (wager >= 0),
  payout integer not null check (payout >= 0),
  balance_before integer not null check (balance_before >= 0),
  balance_after integer not null check (balance_after >= 0),
  created_at timestamptz not null default now(),
  unique (run_id, nonce)
);

create index if not exists spins_run_created_idx
  on public.spins(run_id, created_at asc);

create table if not exists public.friendships (
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_user_id),
  check (user_id <> friend_user_id)
);

alter table public.profiles enable row level security;
alter table public.runs enable row level security;
alter table public.spins enable row level security;
alter table public.friendships enable row level security;

drop policy if exists "profiles are readable" on public.profiles;
create policy "profiles are readable"
  on public.profiles for select
  using (true);

drop policy if exists "users can read own runs" on public.runs;
create policy "users can read own runs"
  on public.runs for select
  using (auth.uid() = user_id);

drop policy if exists "users can read own spins" on public.spins;
create policy "users can read own spins"
  on public.spins for select
  using (auth.uid() = user_id);

drop policy if exists "users can read own friendships" on public.friendships;
create policy "users can read own friendships"
  on public.friendships for select
  using (auth.uid() = user_id);

drop policy if exists "users can delete own friendships" on public.friendships;
create policy "users can delete own friendships"
  on public.friendships for delete
  using (auth.uid() = user_id);
