create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  username citext not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create index if not exists app_sessions_user_expires_idx
  on public.app_sessions(user_id, expires_at desc);

create table if not exists public.app_recovery_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  key_hash text not null unique,
  purpose text not null default 'account_recovery' check (purpose in ('account_recovery')),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists app_recovery_keys_user_active_idx
  on public.app_recovery_keys(user_id, created_at desc)
  where used_at is null;

truncate public.friendships, public.spins, public.runs;

alter table public.runs drop constraint if exists runs_user_id_fkey;
alter table public.runs
  add constraint runs_user_id_fkey
  foreign key (user_id) references public.app_users(id) on delete cascade;

alter table public.spins drop constraint if exists spins_user_id_fkey;
alter table public.spins
  add constraint spins_user_id_fkey
  foreign key (user_id) references public.app_users(id) on delete cascade;

alter table public.friendships drop constraint if exists friendships_user_id_fkey;
alter table public.friendships drop constraint if exists friendships_friend_user_id_fkey;
alter table public.friendships
  add constraint friendships_user_id_fkey
  foreign key (user_id) references public.app_users(id) on delete cascade;
alter table public.friendships
  add constraint friendships_friend_user_id_fkey
  foreign key (friend_user_id) references public.app_users(id) on delete cascade;

alter table public.app_users enable row level security;
alter table public.app_sessions enable row level security;
alter table public.app_recovery_keys enable row level security;

drop policy if exists "app users are readable" on public.app_users;
create policy "app users are readable"
  on public.app_users for select
  using (true);
