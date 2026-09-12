begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.operational_events (
  id bigint generated always as identity primary key,
  company_id uuid references public.companies(id) on delete cascade,
  event_type text not null check (event_type in (
    'upload_completed','upload_failed','extraction_started','extraction_completed','extraction_failed',
    'authorization_denied','api_request','calculation_error'
  )),
  route_key text not null check (char_length(route_key) between 1 and 120),
  outcome text not null check (outcome in ('success','failure','denied','accepted')),
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 600000),
  status_code integer check (status_code is null or status_code between 100 and 599),
  error_code text check (error_code is null or char_length(error_code) <= 120),
  entity_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists operational_events_created_idx
  on private.operational_events(created_at desc);
create index if not exists operational_events_type_created_idx
  on private.operational_events(event_type, created_at desc);
create index if not exists operational_events_company_created_idx
  on private.operational_events(company_id, created_at desc);

revoke all on table private.operational_events from public, anon, authenticated;

create or replace function public.record_operational_event(
  target_company_id uuid,
  target_event_type text,
  target_route_key text,
  target_outcome text,
  target_duration_ms integer default null,
  target_status_code integer default null,
  target_error_code text default null,
  target_entity_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'service role required';
  end if;

  if target_event_type not in (
    'upload_completed','upload_failed','extraction_started','extraction_completed','extraction_failed',
    'authorization_denied','api_request','calculation_error'
  ) then
    raise exception 'unsupported operational event';
  end if;
  if target_outcome not in ('success','failure','denied','accepted') then
    raise exception 'unsupported operational outcome';
  end if;
  if target_route_key is null or char_length(target_route_key) < 1 or char_length(target_route_key) > 120 then
    raise exception 'invalid route key';
  end if;
  if target_duration_ms is not null and (target_duration_ms < 0 or target_duration_ms > 600000) then
    raise exception 'invalid duration';
  end if;
  if target_status_code is not null and (target_status_code < 100 or target_status_code > 599) then
    raise exception 'invalid status code';
  end if;

  insert into private.operational_events(
    company_id, event_type, route_key, outcome, duration_ms, status_code, error_code, entity_id
  ) values (
    target_company_id, target_event_type, left(target_route_key, 120), target_outcome,
    target_duration_ms, target_status_code, left(target_error_code, 120), target_entity_id
  );

  -- Keep operational telemetry deliberately short-lived and privacy-minimal.
  delete from private.operational_events
   where created_at < now() - interval '30 days';
end;
$$;

revoke all on function public.record_operational_event(uuid,text,text,text,integer,integer,text,uuid)
  from public, anon, authenticated;
grant execute on function public.record_operational_event(uuid,text,text,text,integer,integer,text,uuid)
  to service_role;

create or replace function public.get_operational_metrics_snapshot(
  since_at timestamptz default now() - interval '24 hours'
) returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  result jsonb;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'service role required';
  end if;
  if since_at is null or since_at < now() - interval '30 days' or since_at > now() then
    raise exception 'metrics window outside retained range';
  end if;

  select jsonb_build_object(
    'since', since_at,
    'generated_at', now(),
    'uploads', jsonb_build_object(
      'completed', count(*) filter (where event_type='upload_completed'),
      'failed', count(*) filter (where event_type='upload_failed'),
      'success_rate', case
        when count(*) filter (where event_type in ('upload_completed','upload_failed')) = 0 then null
        else round(100.0 * count(*) filter (where event_type='upload_completed') /
          count(*) filter (where event_type in ('upload_completed','upload_failed')), 2)
      end
    ),
    'extractions', jsonb_build_object(
      'started', count(*) filter (where event_type='extraction_started'),
      'completed', count(*) filter (where event_type='extraction_completed'),
      'failed', count(*) filter (where event_type='extraction_failed'),
      'success_rate', case
        when count(*) filter (where event_type in ('extraction_completed','extraction_failed')) = 0 then null
        else round(100.0 * count(*) filter (where event_type='extraction_completed') /
          count(*) filter (where event_type in ('extraction_completed','extraction_failed')), 2)
      end
    ),
    'authorization_denied', count(*) filter (where event_type='authorization_denied'),
    'calculation_errors', count(*) filter (where event_type='calculation_error'),
    'average_api_latency_ms', round(avg(duration_ms) filter (where event_type='api_request'), 1)
  ) into result
  from private.operational_events
  where created_at >= since_at;

  return result || jsonb_build_object(
    'failed_jobs', (select count(*) from public.invoice_processing_jobs where status='failed' and updated_at >= since_at),
    'average_processing_ms', (
      select round(avg(extract(epoch from (completed_at - started_at)) * 1000), 1)
      from public.invoice_processing_jobs
      where started_at >= since_at and completed_at is not null and completed_at >= started_at
    ),
    'needs_review_percent', (
      select case when count(*)=0 then null
        else round(100.0 * count(*) filter (where review_status='pending') / count(*), 2) end
      from public.invoices where created_at >= since_at
    ),
    'field_corrections', (
      select count(*) from public.invoice_field_corrections where created_at >= since_at
    )
  );
end;
$$;

revoke all on function public.get_operational_metrics_snapshot(timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_operational_metrics_snapshot(timestamptz)
  to service_role;

commit;
