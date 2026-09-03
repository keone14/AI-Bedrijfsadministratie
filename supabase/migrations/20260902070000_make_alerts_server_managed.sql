begin;

-- Alerts represent trusted system/admin state derived from validated company data,
-- document/invoice checks and rule logic. Browser clients may read alerts for
-- their own companies, but may not fabricate, rewrite, resolve or delete them.
drop policy if exists "alerts_member_all" on public.alerts;
drop policy if exists "alerts_member_read" on public.alerts;

create policy "alerts_member_read"
on public.alerts for select
to authenticated
using (public.is_company_member(company_id));

-- Defense in depth: RLS already blocks these operations for authenticated users,
-- while explicit privilege revocation prevents accidental future bypass via a
-- permissive policy added elsewhere.
revoke insert, update, delete on public.alerts from authenticated;

commit;
