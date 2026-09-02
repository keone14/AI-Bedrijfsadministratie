begin;

create or replace function public.apply_learned_category_preference()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  learned_category_id uuid;
begin
  -- This trigger only reacts when a fresh extraction confidence is written.
  -- Human field corrections do not change extraction_confidence, so they cannot
  -- accidentally re-apply an old preference while the user is reviewing.
  if new.extraction_confidence is not distinct from old.extraction_confidence then
    return new;
  end if;

  if new.category_id is not null or nullif(lower(btrim(new.supplier_name)), '') is null then
    return new;
  end if;

  select cp.preferred_category_id
    into learned_category_id
    from public.category_preferences cp
    join public.categories c on c.id = cp.preferred_category_id and c.active = true
   where cp.company_id = new.company_id
     and cp.supplier_pattern = lower(btrim(new.supplier_name))
   limit 1;

  if learned_category_id is null then
    return new;
  end if;

  update public.invoices
     set category_id = learned_category_id,
         category_confidence = 1,
         updated_at = now()
   where id = new.id;

  insert into public.audit_logs(
    company_id, actor_user_id, action, entity_type, entity_id, metadata_json
  ) values (
    new.company_id,
    null,
    'invoice_category_preference_applied',
    'invoice',
    new.id,
    jsonb_build_object(
      'supplier_pattern', lower(btrim(new.supplier_name)),
      'category_id', learned_category_id,
      'source', 'company_user_correction'
    )
  );

  return new;
end;
$$;

revoke all on function public.apply_learned_category_preference() from public, anon, authenticated;

drop trigger if exists apply_learned_category_preference on public.invoices;
create trigger apply_learned_category_preference
after update of extraction_confidence on public.invoices
for each row
execute function public.apply_learned_category_preference();

commit;
