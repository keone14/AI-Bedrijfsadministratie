begin;

-- Original business documents are evidence. Authenticated clients may upload and
-- read them, but must not be able to overwrite or permanently delete the stored
-- bytes directly. A future controlled server-side deletion flow can use trusted
-- credentials after retention checks, explicit confirmation and audit logging.
drop policy if exists "company_storage_update" on storage.objects;
drop policy if exists "company_storage_delete" on storage.objects;

-- Likewise, do not allow a browser client to delete the document database record
-- independently from the original object and its required audit/retention flow.
drop policy if exists "documents_member_delete" on public.documents;

-- Freeze the identity/provenance fields that bind a document row to its original
-- uploaded object. Descriptive and processing metadata can still be updated.
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

  return new;
end;
$$;

revoke all on function public.protect_document_identity() from public;

drop trigger if exists protect_document_identity on public.documents;
create trigger protect_document_identity
before update of company_id, storage_path, original_filename, mime_type, file_hash
on public.documents
for each row execute function public.protect_document_identity();

commit;
