begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.api_rate_limits (
  scope_hash text not null,
  action text not null,
  window_started_at timestamptz not null default statement_timestamp(),
  request_count integer not null default 1 check (request_count > 0),
  primary key (scope_hash, action),
  constraint api_rate_limits_scope_hash_format check (scope_hash ~ '^[0-9a-f]{64}$'),
  constraint api_rate_limits_action_format check (action ~ '^[a-z0-9:_-]{1,80}$')
);

revoke all on table private.api_rate_limits from public, anon, authenticated;
create index if not exists api_rate_limits_window_started_at_idx
  on private.api_rate_limits (window_started_at);

create or replace function public.consume_api_rate_limit(
  target_scope_hash text,
  target_action text,
  target_max_requests integer,
  target_window_seconds integer
) returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
  current_window_started_at timestamptz;
  now_at timestamptz := statement_timestamp();
begin
  if target_scope_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid rate limit scope';
  end if;
  if target_action !~ '^[a-z0-9:_-]{1,80}$' then
    raise exception 'invalid rate limit action';
  end if;
  if target_max_requests < 1 or target_max_requests > 1000 then
    raise exception 'invalid rate limit maximum';
  end if;
  if target_window_seconds < 1 or target_window_seconds > 86400 then
    raise exception 'invalid rate limit window';
  end if;

  insert into private.api_rate_limits as limits (
    scope_hash,
    action,
    window_started_at,
    request_count
  ) values (
    target_scope_hash,
    target_action,
    now_at,
    1
  )
  on conflict (scope_hash, action) do update
    set window_started_at = case
          when limits.window_started_at <= now_at - make_interval(secs => target_window_seconds)
            then now_at
          else limits.window_started_at
        end,
        request_count = case
          when limits.window_started_at <= now_at - make_interval(secs => target_window_seconds)
            then 1
          else limits.request_count + 1
        end
  returning request_count, window_started_at
    into current_count, current_window_started_at;

  allowed := current_count <= target_max_requests;
  remaining := greatest(target_max_requests - current_count, 0);
  retry_after_seconds := case
    when allowed then 0
    else greatest(
      1,
      ceil(extract(epoch from (
        current_window_started_at
        + make_interval(secs => target_window_seconds)
        - now_at
      )))::integer
    )
  end;

  return next;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, text, integer, integer)
  to service_role;

commit;
