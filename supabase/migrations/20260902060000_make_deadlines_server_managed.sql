begin;

-- Fiscal/legal deadline facts must come from trusted rule processing, not from a
-- browser client. Members may read their company's deadlines, but creation,
-- rule/source changes, due-date changes and deletion are server-managed.
drop policy if exists "deadlines_member_all" on public.deadlines;
drop policy if exists "deadlines_member_read" on public.deadlines;

create policy "deadlines_member_read"
on public.deadlines for select
to authenticated
using (public.is_company_member(company_id));

-- The one V1 state change a user is explicitly allowed to perform is confirming
-- that a deadline has been completed. Keep that action narrow and auditable.
create or replace function public.complete_deadline(target_deadline_id uuid)
returns public.deadlines
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  current_deadline public.deadlines;
  updated_deadline public.deadlines;
begin
  if actor_id is null then
    raise exception 'authentication required';
  end if;

  select *
  into current_deadline
  from public.deadlines
  where id = target_deadline_id;

  if not found then
    raise exception 'deadline not found';
  end if;

  if not public.is_company_member(current_deadline.company_id) then
    raise exception 'access denied';
  end if;

  if current_deadline.completed_by is not null or current_deadline.status = 'completed' then
    return current_deadline;
  end if;

  update public.deadlines
  set status = 'completed',
      completed_by = actor_id,
      updated_at = now()
  where id = target_deadline_id
  returning * into updated_deadline;

  insert into public.audit_logs(
    company_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    before_json,
    after_json,
    metadata_json
  ) values (
    updated_deadline.company_id,
    actor_id,
    'deadline_completed',
    'deadline',
    updated_deadline.id,
    jsonb_build_object(
      'status', current_deadline.status,
      'completed_at', current_deadline.completed_at,
      'completed_by', current_deadline.completed_by
    ),
    jsonb_build_object(
      'status', updated_deadline.status,
      'completed_at', updated_deadline.completed_at,
      'completed_by', updated_deadline.completed_by
    ),
    jsonb_build_object('confirmation_source', 'authenticated_user')
  );

  return updated_deadline;
end;
$$;

revoke all on function public.complete_deadline(uuid) from public;
grant execute on function public.complete_deadline(uuid) to authenticated;

commit;
