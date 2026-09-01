begin;

-- Keep tenant relations internally consistent. RLS protects row access, but it does
-- not by itself guarantee that two referenced rows belong to the same company.
create or replace function public.enforce_invoice_document_company()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  document_company_id uuid;
begin
  select d.company_id
    into document_company_id
    from public.documents d
   where d.id = new.document_id;

  if document_company_id is null then
    raise exception 'invoice document not found';
  end if;

  if document_company_id <> new.company_id then
    raise exception 'invoice and document must belong to the same company';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_invoice_document_company() from public;

drop trigger if exists enforce_invoice_document_company on public.invoices;
create trigger enforce_invoice_document_company
before insert or update of company_id, document_id on public.invoices
for each row execute function public.enforce_invoice_document_company();

-- Audit-like actor fields must represent the authenticated user and must not be
-- freely spoofable by another member of the same company.
drop policy if exists "documents_member_all" on public.documents;

create policy "documents_member_select"
on public.documents for select
to authenticated
using (public.is_company_member(company_id));

create policy "documents_member_insert"
on public.documents for insert
to authenticated
with check (
  public.is_company_member(company_id)
  and uploaded_by = auth.uid()
);

create policy "documents_member_update"
on public.documents for update
to authenticated
using (public.is_company_member(company_id))
with check (
  public.is_company_member(company_id)
  and uploaded_by = auth.uid()
);

create policy "documents_member_delete"
on public.documents for delete
to authenticated
using (public.is_company_member(company_id));

create or replace function public.protect_invoice_approval_actor()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.approved_by is not null and new.approved_by <> auth.uid() then
      raise exception 'approved_by must match authenticated user';
    end if;
    return new;
  end if;

  if old.approved_by is not null and new.approved_by is distinct from old.approved_by then
    raise exception 'approved_by cannot be changed once set';
  end if;

  if old.approved_by is null and new.approved_by is not null and new.approved_by <> auth.uid() then
    raise exception 'approved_by must match authenticated user';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_invoice_approval_actor() from public;

drop trigger if exists protect_invoice_approval_actor on public.invoices;
create trigger protect_invoice_approval_actor
before insert or update of approved_by on public.invoices
for each row execute function public.protect_invoice_approval_actor();

create or replace function public.protect_deadline_completion_actor()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.completed_by is not null and new.completed_by <> auth.uid() then
      raise exception 'completed_by must match authenticated user';
    end if;
    return new;
  end if;

  if old.completed_by is not null and new.completed_by is distinct from old.completed_by then
    raise exception 'completed_by cannot be changed once set';
  end if;

  if old.completed_by is null and new.completed_by is not null and new.completed_by <> auth.uid() then
    raise exception 'completed_by must match authenticated user';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_deadline_completion_actor() from public;

drop trigger if exists protect_deadline_completion_actor on public.deadlines;
create trigger protect_deadline_completion_actor
before insert or update of completed_by on public.deadlines
for each row execute function public.protect_deadline_completion_actor();

-- AI interaction records are audit data. A client may only create a record for
-- itself, and the actor identity cannot later be rewritten.
drop policy if exists "ai_interactions_member_all" on public.ai_interactions;

create policy "ai_interactions_member_select"
on public.ai_interactions for select
to authenticated
using (public.is_company_member(company_id));

create policy "ai_interactions_member_insert"
on public.ai_interactions for insert
to authenticated
with check (
  public.is_company_member(company_id)
  and user_id = auth.uid()
);

create policy "ai_interactions_member_update"
on public.ai_interactions for update
to authenticated
using (
  public.is_company_member(company_id)
  and user_id = auth.uid()
)
with check (
  public.is_company_member(company_id)
  and user_id = auth.uid()
);

-- Audit-style AI interaction rows should not be deletable from the client.
-- Service-role/server maintenance remains possible because service role bypasses RLS.

commit;
