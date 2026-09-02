begin;

-- AI interaction metadata is part of the audit trail. A browser must not be able
-- to manufacture or rewrite model/version, source references or status history.
-- Authenticated users may read interaction records for companies they belong to;
-- trusted server-side code (service role) remains responsible for writes.
drop policy if exists "ai_interactions_member_insert" on public.ai_interactions;
drop policy if exists "ai_interactions_member_update" on public.ai_interactions;

-- Keep the read policy explicit and tenant-scoped.
drop policy if exists "ai_interactions_member_select" on public.ai_interactions;
create policy "ai_interactions_member_select"
on public.ai_interactions for select
to authenticated
using (public.is_company_member(company_id));

commit;
