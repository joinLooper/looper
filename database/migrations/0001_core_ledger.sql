begin;

create table if not exists users (
  id uuid primary key,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists missions (
  id uuid primary key,
  title text not null,
  star_reward integer not null check (star_reward >= 0),
  energy_reward integer not null check (energy_reward >= 0),
  created_at timestamptz not null default now()
);

create table if not exists mission_enrollments (
  id uuid primary key,
  user_id uuid not null references users(id),
  mission_id uuid not null references missions(id),
  status text not null check (status in ('awaiting_verification', 'completed')),
  accepted_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, mission_id)
);

create table if not exists redemptions (
  id uuid primary key,
  idempotency_key text not null unique,
  user_id uuid not null references users(id),
  mission_id uuid not null references missions(id),
  merchant_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, mission_id)
);

create table if not exists ledger_entries (
  id uuid primary key,
  user_id uuid not null references users(id),
  asset text not null check (asset in ('star', 'energy')),
  amount integer not null check (amount <> 0),
  reason text not null check (reason in ('mission_reward', 'admin_adjustment', 'reversal')),
  reference_type text not null check (reference_type in ('redemption', 'admin_operation')),
  reference_id uuid not null,
  created_at timestamptz not null default now(),
  unique (asset, reason, reference_type, reference_id)
);

create table if not exists audit_events (
  id uuid primary key,
  actor_role text not null check (actor_role in ('user', 'merchant', 'admin')),
  actor_id uuid not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ledger_entries_user_asset_created_idx
  on ledger_entries (user_id, asset, created_at desc);

create index if not exists audit_events_entity_created_idx
  on audit_events (entity_type, entity_id, created_at desc);

commit;
