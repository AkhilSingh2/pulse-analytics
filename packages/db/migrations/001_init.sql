create extension if not exists pgcrypto;

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  api_key text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  client_event_id text not null,
  event_name text not null,
  anonymous_id text not null,
  user_id text,
  session_id text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  path text,
  referrer text,
  referrer_host text not null,
  channel text not null,
  country text not null,
  device text not null,
  properties jsonb not null default '{}'::jsonb,
  unique (project_id, client_event_id)
);

create index if not exists events_project_time_idx on events (project_id, occurred_at desc);
create index if not exists events_project_name_time_idx on events (project_id, event_name, occurred_at);
create index if not exists events_project_actor_idx on events (project_id, anonymous_id, occurred_at);

create table if not exists rollup_hourly (
  project_id uuid not null references projects (id) on delete cascade,
  bucket timestamptz not null,
  event_name text not null,
  device text not null,
  channel text not null,
  event_count integer not null check (event_count >= 0),
  primary key (project_id, bucket, event_name, device, channel)
);

create table if not exists rollup_page_daily (
  project_id uuid not null references projects (id) on delete cascade,
  day date not null,
  path text not null,
  views integer not null check (views >= 0),
  primary key (project_id, day, path)
);

create table if not exists rollup_referrer_daily (
  project_id uuid not null references projects (id) on delete cascade,
  day date not null,
  referrer_host text not null,
  views integer not null check (views >= 0),
  primary key (project_id, day, referrer_host)
);

create table if not exists saved_views (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  name text not null,
  path text not null,
  query text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists saved_views_project_idx on saved_views (project_id, created_at desc);
