begin;

-- General documents and invoices share the same immutable documents table. Their
-- registration paths must therefore enforce exact-file duplicate protection at the
-- database transaction boundary, not only with a separate SELECT in an API route.
-- The advisory lock serializes concurrent registrations for the same company/hash.

create or replace function public.register_validated_invoice_upload(
  target_company_id uuid,
  target_document_id uuid,
  target_storage_path text,
  original_name text,
  safe_display_name text,
  detected_mime text,
  sha256_hash text,
  validated_size_bytes bigint
) returns uuid
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  new_invoice_id uuid;
  object_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if not public.is_company_member(target_company_id) then
    raise exception 'company access denied';
  end if;
  if detected_mime not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'unsupported file type';
  end if;
  if validated_size_bytes < 1 or validated_size_bytes > 10485760 then
    raise exception 'file size outside allowed range';
  end if;
  if sha256_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid sha256 hash';
  end if;
  if public.storage_company_id(target_storage_path) is distinct from target_company_id
     or public.storage_document_id(target_storage_path) is distinct from target_document_id then
    raise exception 'invalid storage path';
  end if;

  select o.owner into object_owner
  from storage.objects o
  where o.bucket_id = 'company-documents' and o.name = target_storage_path;

  if object_owner is null or object_owner <> auth.uid() then
    raise exception 'uploaded object not owned by authenticated user';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(target_company_id::text || ':' || sha256_hash, 0)
  );

  if exists (
    select 1 from public.documents d
    where d.company_id = target_company_id and d.file_hash = sha256_hash
  ) then
    raise exception 'duplicate document';
  end if;

  insert into public.documents(
    id, company_id, uploaded_by, original_filename, display_name, mime_type,
    storage_path, file_hash, file_size_bytes, document_type, processing_status, review_status
  ) values (
    target_document_id, target_company_id, auth.uid(), original_name, safe_display_name,
    detected_mime, target_storage_path, sha256_hash, validated_size_bytes,
    'invoice', 'uploaded', 'pending'
  );

  insert into public.invoices(company_id, document_id, review_status)
  values (target_company_id, target_document_id, 'pending')
  returning id into new_invoice_id;

  insert into public.audit_logs(company_id, actor_user_id, action, entity_type, entity_id, after_json)
  values (
    target_company_id,
    auth.uid(),
    'invoice_uploaded',
    'document',
    target_document_id,
    jsonb_build_object(
      'invoice_id', new_invoice_id,
      'mime_type', detected_mime,
      'file_size_bytes', validated_size_bytes,
      'sha256', sha256_hash
    )
  );

  return new_invoice_id;
end;
$$;

revoke all on function public.register_validated_invoice_upload(uuid, uuid, text, text, text, text, text, bigint) from public;
revoke all on function public.register_validated_invoice_upload(uuid, uuid, text, text, text, text, text, bigint) from anon;
grant execute on function public.register_validated_invoice_upload(uuid, uuid, text, text, text, text, text, bigint) to authenticated;

-- Register a validated non-invoice document atomically. The API route has already
-- verified the real bytes; this function owns the authoritative duplicate check,
-- immutable document insert and audit event in one transaction.
create or replace function public.register_validated_document_upload(
  target_company_id uuid,
  target_document_id uuid,
  target_storage_path text,
  original_name text,
  safe_display_name text,
  detected_mime text,
  sha256_hash text,
  validated_size_bytes bigint
) returns uuid
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  object_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  if not public.is_company_member(target_company_id) then
    raise exception 'company access denied';
  end if;
  if detected_mime not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'unsupported file type';
  end if;
  if validated_size_bytes < 1 or validated_size_bytes > 10485760 then
    raise exception 'file size outside allowed range';
  end if;
  if sha256_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid sha256 hash';
  end if;
  if public.storage_company_id(target_storage_path) is distinct from target_company_id
     or public.storage_document_id(target_storage_path) is distinct from target_document_id then
    raise exception 'invalid storage path';
  end if;

  select o.owner into object_owner
  from storage.objects o
  where o.bucket_id = 'company-documents' and o.name = target_storage_path;

  if object_owner is null or object_owner <> auth.uid() then
    raise exception 'uploaded object not owned by authenticated user';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(target_company_id::text || ':' || sha256_hash, 0)
  );

  if exists (
    select 1 from public.documents d
    where d.company_id = target_company_id and d.file_hash = sha256_hash
  ) then
    raise exception 'duplicate document';
  end if;

  insert into public.documents(
    id, company_id, uploaded_by, original_filename, display_name, mime_type,
    storage_path, file_hash, file_size_bytes, document_type, document_type_confidence,
    processing_status, review_status
  ) values (
    target_document_id, target_company_id, auth.uid(), original_name, safe_display_name,
    detected_mime, target_storage_path, sha256_hash, validated_size_bytes,
    null, null, 'uploaded', 'pending'
  );

  insert into public.audit_logs(company_id, actor_user_id, action, entity_type, entity_id, after_json, metadata_json)
  values (
    target_company_id,
    auth.uid(),
    'document_uploaded',
    'document',
    target_document_id,
    jsonb_build_object(
      'mime_type', detected_mime,
      'file_size_bytes', validated_size_bytes,
      'processing_status', 'uploaded',
      'review_status', 'pending'
    ),
    jsonb_build_object('upload_source', 'documents')
  );

  return target_document_id;
end;
$$;

revoke all on function public.register_validated_document_upload(uuid, uuid, text, text, text, text, text, bigint) from public;
revoke all on function public.register_validated_document_upload(uuid, uuid, text, text, text, text, text, bigint) from anon;
grant execute on function public.register_validated_document_upload(uuid, uuid, text, text, text, text, text, bigint) to authenticated;

commit;
