begin;

alter table public.invoices
  add column if not exists duplicate_resolution text,
  add column if not exists duplicate_resolved_at timestamptz,
  add column if not exists duplicate_resolved_by uuid references auth.users(id);

alter table public.invoices
  drop constraint if exists invoices_duplicate_resolution_check;

alter table public.invoices
  add constraint invoices_duplicate_resolution_check
  check (duplicate_resolution is null or duplicate_resolution = 'confirmed_distinct');

create or replace function public.set_invoice_duplicate_resolution(
  target_invoice_id uuid,
  target_is_distinct boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid;
  previous_resolution text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select i.company_id, i.duplicate_resolution
    into target_company_id, previous_resolution
  from public.invoices i
  where i.id = target_invoice_id
  for update;

  if target_company_id is null then
    raise exception 'invoice not found';
  end if;

  if not public.is_company_member(target_company_id) then
    raise exception 'company access denied';
  end if;

  if target_is_distinct then
    if previous_resolution = 'confirmed_distinct' then
      return;
    end if;

    update public.invoices
    set duplicate_resolution = 'confirmed_distinct',
        duplicate_resolved_at = now(),
        duplicate_resolved_by = auth.uid(),
        updated_at = now()
    where id = target_invoice_id;
  else
    if previous_resolution is null then
      return;
    end if;

    update public.invoices
    set duplicate_resolution = null,
        duplicate_resolved_at = null,
        duplicate_resolved_by = null,
        updated_at = now()
    where id = target_invoice_id;
  end if;

  insert into public.audit_logs(
    company_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    before_json,
    after_json
  ) values (
    target_company_id,
    auth.uid(),
    case when target_is_distinct then 'invoice_duplicate_marked_distinct' else 'invoice_duplicate_resolution_reset' end,
    'invoice',
    target_invoice_id,
    jsonb_build_object('duplicate_resolution', previous_resolution),
    jsonb_build_object('duplicate_resolution', case when target_is_distinct then 'confirmed_distinct' else null end)
  );
end;
$$;

revoke all on function public.set_invoice_duplicate_resolution(uuid, boolean) from public;
revoke all on function public.set_invoice_duplicate_resolution(uuid, boolean) from anon;
grant execute on function public.set_invoice_duplicate_resolution(uuid, boolean) to authenticated;

commit;
