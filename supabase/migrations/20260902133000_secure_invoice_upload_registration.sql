begin;

-- Store the byte size that was validated during upload finalization.
alter table public.documents
  add column if not exists file_size_bytes bigint;

alter table public.documents
  drop constraint if exists documents_file_size_bytes_range;
alter table public.documents
  add constraint documents_file_size_bytes_range
  check (file_size_bytes is null or file_size_bytes between 1 and 10485760);

-- Parse the document id from the canonical immutable storage path:
-- company/{company_id}/documents/{document_id}/original.{ext}
create or replace function public.storage_document_id(object_name text)
returns uuid
language plpgsql
stable
security invoker
set search_path = public, storage
as $$
declare
  folders text[];
begin
  folders := storage.foldername(object_name);
  if coalesce(folders[1], '') <> 'company' or coalesce(folders[3], '') <> 'documents' then
    return null;
  end if;
  begin
    return folders[4]::uuid;
  exception when invalid_text_representation then
    return null;
  end;
end;
$$;

revoke all on function public.storage_document_id(text) from public;
grant execute on function public.storage_document_id(text) to authenticated;

-- Only accept new objects in the canonical path. Existing read access remains
-- company-scoped. Original objects remain append-only after upload.
drop policy if exists "company_storage_insert" on storage.objects;
create policy "company_storage_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'company-documents'
  and public.is_company_member(public.storage_company_id(name))
  and public.storage_document_id(name) is not null
);

-- A browser must not fabricate a validated document row. Registration happens only
-- after the server has downloaded the private object and checked its real signature,
-- size and SHA-256 hash.
drop policy if exists "documents_member_insert" on public.documents;

-- Invoice creation belongs to the same controlled ingest path. Users may read and
-- later review/update their own-company invoice, but may not directly create/delete
-- invoice rows from the browser.
drop policy if exists "invoices_member_all" on public.invoices;
drop policy if exists "invoices_member_select" on public.invoices;
drop policy if exists "invoices_member_update" on public.invoices;
drop policy if exists "invoices_member_delete" on public.invoices;
drop policy if exists "invoices_member_insert" on public.invoices;

create policy "invoices_member_select"
on public.invoices for select
to authenticated
using (public.is_company_member(company_id));

create policy "invoices_member_update"
on public.invoices for update
to authenticated
using (public.is_company_member(company_id))
with check (public.is_company_member(company_id));

-- Freeze size together with the provenance fields once registration succeeded.
create or replace function public.protect_document_identity()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.company_id is distinct from old.company_id then
    raise exception 'document company_id cannot be changed';
  end if;
  if new.storage_path is distinct from old.storage_path then
    raise exception 'document storage_path cannot be changed';
  end if;
  if new.original_filename is distinct from old.original_filename then
    raise exception 'document original_filename cannot be changed';
  end if;
  if new.mime_type is distinct from old.mime_type then
    raise exception 'document mime_type cannot be changed';
  end if;
  if old.file_hash is not null and new.file_hash is distinct from old.file_hash then
    raise exception 'document file_hash cannot be changed once set';
  end if;
  if old.file_size_bytes is not null and new.file_size_bytes is distinct from old.file_size_bytes then
    raise exception 'document file_size_bytes cannot be changed once set';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_document_identity() from public;

drop trigger if exists protect_document_identity on public.documents;
create trigger protect_document_identity
before update of company_id, storage_path, original_filename, mime_type, file_hash, file_size_bytes
on public.documents
for each row execute function public.protect_document_identity();

-- Finalize a server-validated object into an immutable document + invoice stub.
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
grant execute on function public.register_validated_invoice_upload(uuid, uuid, text, text, text, text, text, bigint) to authenticated;

-- Cleanup is only allowed for a just-uploaded object that has NOT been registered as
-- a preserved document. This is rollback of a failed ingest, not deletion of evidence.
create or replace function public.discard_unregistered_upload(target_storage_path text)
returns boolean
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  target_company_id uuid;
  deleted_count integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  target_company_id := public.storage_company_id(target_storage_path);
  if target_company_id is null or not public.is_company_member(target_company_id) then
    raise exception 'company access denied';
  end if;

  if exists (select 1 from public.documents d where d.storage_path = target_storage_path) then
    raise exception 'registered original documents cannot be discarded';
  end if;

  delete from storage.objects o
  where o.bucket_id = 'company-documents'
    and o.name = target_storage_path
    and o.owner = auth.uid();

  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

revoke all on function public.discard_unregistered_upload(text) from public;
grant execute on function public.discard_unregistered_upload(text) to authenticated;

commit;
