begin;

-- Invoice extraction records are evidence of what the processing pipeline read.
-- They include proposed/normalized values, confidence and model metadata, so the
-- browser must not be able to forge, rewrite or delete that audit trail.
drop policy if exists "invoice_extractions_member_all" on public.invoice_extractions;
drop policy if exists "invoice_extractions_member_select" on public.invoice_extractions;
drop policy if exists "invoice_extractions_member_insert" on public.invoice_extractions;
drop policy if exists "invoice_extractions_member_update" on public.invoice_extractions;
drop policy if exists "invoice_extractions_member_delete" on public.invoice_extractions;

create policy "invoice_extractions_member_select"
on public.invoice_extractions for select
to authenticated
using (
  exists (
    select 1
      from public.invoices i
     where i.id = invoice_extractions.invoice_id
       and public.is_company_member(i.company_id)
  )
);

-- No INSERT/UPDATE/DELETE policy is intentionally created for authenticated.
-- Trusted server-side processing (service role) owns AI extraction writes.
-- User corrections should be recorded through a controlled review service/RPC,
-- rather than by rewriting the original extraction evidence.

commit;
