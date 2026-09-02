begin;

-- Prevent anonymous callers from invoking security-definer functions exposed by PostgREST.
-- The authenticated grants for create_company_with_owner, complete_deadline and
-- is_company_member are intentional because their bodies perform explicit auth/company checks.
revoke execute on function public.create_company_with_owner(text, text) from anon;
revoke execute on function public.complete_deadline(uuid) from anon;
revoke execute on function public.is_company_member(uuid) from anon;

-- Trigger-only function: neither anonymous nor signed-in clients should call it directly.
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

-- Make the two auth.uid()-based RLS checks init-plan friendly.
drop policy if exists "profiles_self" on public.profiles;
create policy "profiles_self"
on public.profiles for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "documents_member_insert" on public.documents;
create policy "documents_member_insert"
on public.documents for insert
to authenticated
with check (
  public.is_company_member(company_id)
  and uploaded_by = (select auth.uid())
);

-- Cover foreign keys used by tenant filtering, joins, cleanup and audit queries.
create index if not exists idx_ai_interactions_company_id on public.ai_interactions(company_id);
create index if not exists idx_ai_interactions_user_id on public.ai_interactions(user_id);
create index if not exists idx_alerts_company_id on public.alerts(company_id);
create index if not exists idx_audit_logs_company_id on public.audit_logs(company_id);
create index if not exists idx_audit_logs_actor_user_id on public.audit_logs(actor_user_id);
create index if not exists idx_category_preferences_preferred_category_id on public.category_preferences(preferred_category_id);
create index if not exists idx_company_members_user_id on public.company_members(user_id);
create index if not exists idx_deadlines_company_id on public.deadlines(company_id);
create index if not exists idx_deadlines_completed_by on public.deadlines(completed_by);
create index if not exists idx_deadlines_rule_reference_id on public.deadlines(rule_reference_id);
create index if not exists idx_documents_company_id on public.documents(company_id);
create index if not exists idx_documents_uploaded_by on public.documents(uploaded_by);
create index if not exists idx_invoice_extractions_invoice_id on public.invoice_extractions(invoice_id);
create index if not exists idx_invoices_approved_by on public.invoices(approved_by);
create index if not exists idx_invoices_category_id on public.invoices(category_id);
create index if not exists idx_invoices_company_id on public.invoices(company_id);

commit;
