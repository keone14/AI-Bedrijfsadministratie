begin;

create or replace function public.set_document_type(
  target_document_id uuid,
  target_document_type text
) returns public.documents
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  current_document public.documents;
  updated_document public.documents;
begin
  if actor_id is null then
    raise exception 'authentication required';
  end if;

  select *
  into current_document
  from public.documents
  where id = target_document_id
  for update;

  if not found then
    raise exception 'document not found';
  end if;

  if not public.is_company_member(current_document.company_id) then
    raise exception 'company access denied';
  end if;

  if exists (
    select 1 from public.invoices i
    where i.document_id = current_document.id
  ) then
    raise exception 'invoice documents must be managed through the invoice flow';
  end if;

  if target_document_type not in ('tax', 'insurance', 'contract', 'government', 'other') then
    raise exception 'unsupported document type';
  end if;

  if current_document.document_type = target_document_type
     and current_document.review_status = 'confirmed' then
    return current_document;
  end if;

  update public.documents
  set document_type = target_document_type,
      document_type_confidence = null,
      review_status = 'confirmed',
      updated_at = now()
  where id = current_document.id
  returning * into updated_document;

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
    updated_document.company_id,
    actor_id,
    'document_type_confirmed',
    'document',
    updated_document.id,
    jsonb_build_object(
      'document_type', current_document.document_type,
      'review_status', current_document.review_status
    ),
    jsonb_build_object(
      'document_type', updated_document.document_type,
      'review_status', updated_document.review_status
    ),
    jsonb_build_object('confirmation_source', 'authenticated_user')
  );

  return updated_document;
end;
$$;

revoke all on function public.set_document_type(uuid, text) from public;
revoke all on function public.set_document_type(uuid, text) from anon;
grant execute on function public.set_document_type(uuid, text) to authenticated;

commit;
