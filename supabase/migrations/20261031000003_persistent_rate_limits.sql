-- ==============================================================================
-- Raft Board: Migration 20261031000003
-- Description: Persistent serverless rate limiting table and atomic RPC
-- ==============================================================================

-- 1. Persistent rate limits table
create table if not exists public.rate_limits (
  key text primary key,
  count integer not null default 1,
  reset_at timestamp with time zone not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Index on reset_at for fast queries and cleanup
create index if not exists idx_rate_limits_reset_at on public.rate_limits (reset_at);

comment on table public.rate_limits is 'Persistent sliding-window rate limiting shared across serverless instances.';

-- Enable RLS (Service Role / Security Definer access only)
alter table public.rate_limits enable row level security;

-- 2. Atomic rate-limiting function
create or replace function public.consume_rate_limit(
  p_key text,
  p_max_attempts integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  reset_in_seconds integer
) as $$
declare
  v_now timestamp with time zone := timezone('utc'::text, now());
  v_record public.rate_limits%rowtype;
  v_reset_at timestamp with time zone;
begin
  -- Lock row for update to ensure atomic concurrency across serverless functions
  select * into v_record
  from public.rate_limits
  where key = p_key
  for update;

  if not found or v_now > v_record.reset_at then
    -- Expired window or new key: initialize new window
    v_reset_at := v_now + (p_window_seconds || ' seconds')::interval;
    
    insert into public.rate_limits (key, count, reset_at)
    values (p_key, 1, v_reset_at)
    on conflict (key) do update set
      count = 1,
      reset_at = v_reset_at;

    return query select true, p_max_attempts - 1, p_window_seconds;
  else
    -- Active window
    if v_record.count >= p_max_attempts then
      -- Rate limit exceeded
      return query select
        false,
        0,
        greatest(1, ceil(extract(epoch from (v_record.reset_at - v_now))))::integer;
    else
      -- Increment attempt count
      update public.rate_limits
      set count = count + 1
      where key = p_key;

      return query select
        true,
        p_max_attempts - (v_record.count + 1),
        greatest(1, ceil(extract(epoch from (v_record.reset_at - v_now))))::integer;
    end if;
  end if;
end;
$$ language plpgsql security definer set search_path = public;
