begin;

-- Global reference tables are readable by signed-in users, but not writable from the client.
alter table public.categories enable row level security;
alter table public.rule_references enable row level security;

drop policy if exists "categories_authenticated_read" on public.categories;
create policy "categories_authenticated_read"
on public.categories for select
to authenticated
using (true);

drop policy if exists "rule_references_authenticated_read" on public.rule_references;
create policy "rule_references_authenticated_read"
on public.rule_references for select
to authenticated
using (status in ('verified', 'needs_review'));

-- Security-definer functions should not be broadly executable by anonymous/public roles.
revoke all on function public.create_company_with_owner(text, text) from public;
grant execute on function public.create_company_with_owner(text, text) to authenticated;

revoke all on function public.handle_new_user() from public;

-- Membership helper is safe for authenticated use and is needed by RLS policies.
revoke all on function public.is_company_member(uuid) from public;
grant execute on function public.is_company_member(uuid) to authenticated;

-- Parse company id from the canonical private-storage path:
-- company/{company_id}/documents/{document_id}/original.ext
create or replace function public.storage_company_id(object_name text)
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
  if coalesce(folders[1], '') <> 'company' then
    return null;
  end if;
  begin
    return folders[2]::uuid;
  exception when invalid_text_representation then
    return null;
  end;
end;
$$;

revoke all on function public.storage_company_id(text) from public;
grant execute on function public.storage_company_id(text) to authenticated;

-- Replace the first-version storage policies so they match the canonical path above.
drop policy if exists "company_storage_read" on storage.objects;
drop policy if exists "company_storage_insert" on storage.objects;
drop policy if exists "company_storage_update" on storage.objects;
drop policy if exists "company_storage_delete" on storage.objects;

create policy "company_storage_read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'company-documents'
  and public.is_company_member(public.storage_company_id(name))
);

create policy "company_storage_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'company-documents'
  and public.is_company_member(public.storage_company_id(name))
);

create policy "company_storage_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'company-documents'
  and public.is_company_member(public.storage_company_id(name))
)
with check (
  bucket_id = 'company-documents'
  and public.is_company_member(public.storage_company_id(name))
);

create policy "company_storage_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'company-documents'
  and public.is_company_member(public.storage_company_id(name))
);

-- Extra integrity constraints for confidence values.
alter table public.documents
  drop constraint if exists documents_document_type_confidence_range;
alter table public.documents
  add constraint documents_document_type_confidence_range
  check (document_type_confidence is null or document_type_confidence between 0 and 1);

alter table public.invoices
  drop constraint if exists invoices_extraction_confidence_range;
alter table public.invoices
  add constraint invoices_extraction_confidence_range
  check (extraction_confidence is null or extraction_confidence between 0 and 1);

alter table public.invoices
  drop constraint if exists invoices_category_confidence_range;
alter table public.invoices
  add constraint invoices_category_confidence_range
  check (category_confidence is null or category_confidence between 0 and 1);

alter table public.invoice_extractions
  drop constraint if exists invoice_extractions_confidence_range;
alter table public.invoice_extractions
  add constraint invoice_extractions_confidence_range
  check (confidence is null or confidence between 0 and 1);

commit;
