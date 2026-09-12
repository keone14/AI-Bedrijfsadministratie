begin;

-- A corrected AI proposal must never later be marked as if the user confirmed the
-- original proposal. Confirmation approves the effective invoice values while the
-- original extraction and the separate correction history remain distinct evidence.
create or replace function public.confirm_invoice_extraction(target_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid;
  target_document_id uuid;
  current_status text;
  invoice_type_value text;
  supplier_value text;
  customer_value text;
  invoice_date_value date;
  currency_value text;
  subtotal_value numeric;
  vat_value numeric;
  total_value numeric;
  document_type_value text;
  corrected_fields text[];
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select i.company_id, i.document_id, i.review_status, i.invoice_type, i.supplier_name, i.customer_name,
         i.invoice_date, i.currency, i.subtotal, i.vat_amount, i.total, d.document_type
    into target_company_id, target_document_id, current_status, invoice_type_value, supplier_value, customer_value,
         invoice_date_value, currency_value, subtotal_value, vat_value, total_value, document_type_value
    from public.invoices i
    join public.documents d on d.id = i.document_id and d.company_id = i.company_id
   where i.id = target_invoice_id;

  if target_company_id is null or not public.is_company_member(target_company_id) then raise exception 'invoice access denied'; end if;
  if not exists (select 1 from public.invoice_extractions e where e.invoice_id = target_invoice_id) then raise exception 'no extraction available to confirm'; end if;
  if current_status = 'confirmed' then return; end if;

  if document_type_value not in ('invoice','credit_note') then raise exception 'document type must be confirmed'; end if;
  if invoice_type_value not in ('purchase','sale') then raise exception 'invoice type must be confirmed'; end if;
  if invoice_date_value is null then raise exception 'invoice date must be confirmed'; end if;
  if currency_value is null or currency_value !~ '^[A-Z]{3}$' then raise exception 'currency must be confirmed'; end if;
  if total_value is null or subtotal_value is null or vat_value is null then raise exception 'invoice amounts must be confirmed'; end if;
  if abs((subtotal_value + vat_value) - total_value) > 0.02 then raise exception 'invoice amounts do not add up'; end if;
  if invoice_type_value = 'purchase' and nullif(btrim(supplier_value), '') is null then raise exception 'supplier must be confirmed'; end if;
  if invoice_type_value = 'sale' and nullif(btrim(customer_value), '') is null then raise exception 'customer must be confirmed'; end if;

  select coalesce(array_agg(distinct c.field_name order by c.field_name), array[]::text[])
    into corrected_fields
    from public.invoice_field_corrections c
   where c.invoice_id = target_invoice_id;

  update public.invoices
     set review_status = 'confirmed', approved_by = auth.uid(), updated_at = now()
   where id = target_invoice_id;

  update public.documents
     set processing_status = 'completed', review_status = 'confirmed', updated_at = now()
   where id = target_document_id;

  -- Only untouched AI proposals are marked as directly confirmed. If the user
  -- corrected a field, the original proposal remains false and the correction row
  -- is the evidence for the value that was actually approved.
  update public.invoice_extractions e
     set user_confirmed = not exists (
       select 1
         from public.invoice_field_corrections c
        where c.invoice_id = target_invoice_id
          and c.field_name = e.field_name
     )
   where e.invoice_id = target_invoice_id;

  update public.invoice_processing_jobs
     set status = 'completed', completed_at = coalesce(completed_at, now()), updated_at = now()
   where invoice_id = target_invoice_id;

  insert into public.audit_logs(company_id, actor_user_id, action, entity_type, entity_id, metadata_json)
  values(
    target_company_id,
    auth.uid(),
    'invoice_extraction_confirmed',
    'invoice',
    target_invoice_id,
    jsonb_build_object(
      'previous_review_status', current_status,
      'arithmetic_check', 'ok',
      'corrected_fields', to_jsonb(corrected_fields),
      'original_ai_proposals_preserved', true
    )
  );
end;
$$;

revoke all on function public.confirm_invoice_extraction(uuid) from public, anon;
grant execute on function public.confirm_invoice_extraction(uuid) to authenticated;

commit;
