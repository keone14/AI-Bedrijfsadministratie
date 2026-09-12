begin;

-- Important company-profile changes can affect deadlines, warnings and financial
-- interpretation. Record them at the database boundary so the client cannot
-- silently skip, forge or rewrite the audit event.
create or replace function public.audit_company_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_profile jsonb;
  new_profile jsonb;
  changed_fields text[];
begin
  old_profile := jsonb_build_object(
    'name', old.name,
    'enterprise_number', old.enterprise_number,
    'legal_form', old.legal_form,
    'occupation_status', old.occupation_status,
    'vat_status', old.vat_status,
    'vat_frequency', old.vat_frequency,
    'activity_description_raw', old.activity_description_raw,
    'activity_normalized', old.activity_normalized,
    'sells_products_services', old.sells_products_services,
    'employee_status', old.employee_status,
    'start_date', old.start_date,
    'profile_status', old.profile_status
  );

  new_profile := jsonb_build_object(
    'name', new.name,
    'enterprise_number', new.enterprise_number,
    'legal_form', new.legal_form,
    'occupation_status', new.occupation_status,
    'vat_status', new.vat_status,
    'vat_frequency', new.vat_frequency,
    'activity_description_raw', new.activity_description_raw,
    'activity_normalized', new.activity_normalized,
    'sells_products_services', new.sells_products_services,
    'employee_status', new.employee_status,
    'start_date', new.start_date,
    'profile_status', new.profile_status
  );

  select coalesce(array_agg(key order by key), array[]::text[])
    into changed_fields
    from jsonb_each(old_profile) old_item
   where old_item.value is distinct from new_profile -> old_item.key;

  -- Do not create noise when an UPDATE statement did not actually change any
  -- business-profile field.
  if cardinality(changed_fields) = 0 then
    return new;
  end if;

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
    new.id,
    auth.uid(),
    'company_profile_updated',
    'company',
    new.id,
    old_profile,
    new_profile,
    jsonb_build_object('changed_fields', to_jsonb(changed_fields))
  );

  return new;
end;
$$;

-- This function is only for the database trigger. Clients must never be able to
-- call it directly to manufacture audit events.
revoke all on function public.audit_company_profile_change() from public;
revoke all on function public.audit_company_profile_change() from anon;
revoke all on function public.audit_company_profile_change() from authenticated;

drop trigger if exists audit_company_profile_change on public.companies;
create trigger audit_company_profile_change
after update of
  name,
  enterprise_number,
  legal_form,
  occupation_status,
  vat_status,
  vat_frequency,
  activity_description_raw,
  activity_normalized,
  sells_products_services,
  employee_status,
  start_date,
  profile_status
on public.companies
for each row execute function public.audit_company_profile_change();

commit;
