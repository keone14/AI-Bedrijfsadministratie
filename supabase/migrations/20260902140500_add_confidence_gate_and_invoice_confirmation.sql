begin;

-- Human confirmation is a deliberate authenticated action. It never rewrites the
-- original AI proposal; it marks that proposal as confirmed and records the actor/time.
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
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select i.company_id, i.document_id, i.review_status
    into target_company_id, target_document_id, current_status
    from public.invoices i
   where i.id = target_invoice_id;

  if target_company_id is null or not public.is_company_member(target_company_id) then
    raise exception 'invoice access denied';
  end if;

  if not exists (
    select 1 from public.invoice_extractions e where e.invoice_id = target_invoice_id
  ) then
    raise exception 'no extraction available to confirm';
  end if;

  if current_status = 'confirmed' then
    return;
  end if;

  update public.invoices
     set review_status = 'confirmed',
         approved_by = auth.uid(),
         updated_at = now()
   where id = target_invoice_id;

  update public.documents
     set processing_status = 'completed',
         review_status = 'confirmed',
         updated_at = now()
   where id = target_document_id;

  update public.invoice_extractions
     set user_confirmed = true
   where invoice_id = target_invoice_id;

  update public.invoice_processing_jobs
     set status = 'completed',
         completed_at = coalesce(completed_at, now()),
         updated_at = now()
   where invoice_id = target_invoice_id;

  insert into public.audit_logs(
    company_id, actor_user_id, action, entity_type, entity_id, metadata_json
  ) values (
    target_company_id, auth.uid(), 'invoice_extraction_confirmed', 'invoice', target_invoice_id,
    jsonb_build_object('previous_review_status', current_status)
  );
end;
$$;

revoke all on function public.confirm_invoice_extraction(uuid) from public, anon;
grant execute on function public.confirm_invoice_extraction(uuid) to authenticated;

-- Replace extraction application with a conservative deterministic confidence gate.
-- High-confidence means machine-verified, not human-approved: approved_by remains null.
create or replace function public.apply_validated_invoice_extraction(
  target_invoice_id uuid,
  extraction jsonb,
  extraction_model_version text,
  extraction_method_name text default 'vision_structured_output'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid;
  target_document_id uuid;
  field_name text;
  field_payload jsonb;
  min_core_confidence numeric;
  document_type_value text;
  arithmetic_status text;
  subtotal_value numeric;
  vat_value numeric;
  total_value numeric;
  auto_verified boolean;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'service role required';
  end if;

  if extraction is null or jsonb_typeof(extraction) <> 'object' then
    raise exception 'invalid extraction payload';
  end if;

  select i.company_id, i.document_id
    into target_company_id, target_document_id
    from public.invoices i
   where i.id = target_invoice_id;

  if target_company_id is null then
    raise exception 'invoice not found';
  end if;

  perform set_config('app.trusted_invoice_extraction', 'on', true);

  delete from public.invoice_extractions
   where invoice_id = target_invoice_id
     and user_confirmed = false;

  foreach field_name in array array[
    'documentType','supplierName','customerName','invoiceNumber','invoiceDate','dueDate',
    'subtotal','vatAmount','total','currency','description','invoiceType'
  ] loop
    field_payload := extraction -> field_name;
    if field_payload is null
       or not (field_payload ? 'value')
       or not (field_payload ? 'confidence') then
      raise exception 'missing extraction field %', field_name;
    end if;

    if (field_payload ->> 'confidence')::numeric < 0
       or (field_payload ->> 'confidence')::numeric > 1 then
      raise exception 'invalid confidence for field %', field_name;
    end if;

    insert into public.invoice_extractions(
      invoice_id, field_name, proposed_value_json, normalized_value_json,
      confidence, extraction_method, model_version, user_confirmed
    ) values (
      target_invoice_id,
      field_name,
      field_payload -> 'value',
      field_payload -> 'value',
      (field_payload ->> 'confidence')::numeric,
      extraction_method_name,
      extraction_model_version,
      false
    );
  end loop;

  min_core_confidence := least(
    (extraction #>> '{documentType,confidence}')::numeric,
    (extraction #>> '{supplierName,confidence}')::numeric,
    (extraction #>> '{invoiceDate,confidence}')::numeric,
    (extraction #>> '{total,confidence}')::numeric,
    (extraction #>> '{invoiceType,confidence}')::numeric
  );

  document_type_value := extraction #>> '{documentType,value}';
  subtotal_value := nullif(extraction #>> '{subtotal,value}', '')::numeric;
  vat_value := nullif(extraction #>> '{vatAmount,value}', '')::numeric;
  total_value := nullif(extraction #>> '{total,value}', '')::numeric;

  if subtotal_value is null or vat_value is null or total_value is null then
    arithmetic_status := 'incomplete';
  elsif abs((subtotal_value + vat_value) - total_value) <= 0.02 then
    arithmetic_status := 'ok';
  else
    arithmetic_status := 'mismatch';
  end if;

  auto_verified :=
    document_type_value in ('invoice', 'credit_note')
    and nullif(extraction #>> '{supplierName,value}', '') is not null
    and nullif(extraction #>> '{invoiceDate,value}', '') is not null
    and nullif(extraction #>> '{total,value}', '') is not null
    and nullif(extraction #>> '{invoiceType,value}', 'unknown') is not null
    and nullif(extraction #>> '{currency,value}', '') is not null
    and min_core_confidence >= 0.95
    and (extraction #>> '{currency,confidence}')::numeric >= 0.90
    and arithmetic_status = 'ok';

  update public.documents
     set document_type = case when document_type_value in ('invoice','credit_note') then document_type_value else 'unknown' end,
         document_type_confidence = (extraction #>> '{documentType,confidence}')::numeric,
         processing_status = case when auto_verified then 'completed' else 'needs_review' end,
         detected_date = nullif(extraction #>> '{invoiceDate,value}', '')::date,
         detected_expiry_date = nullif(extraction #>> '{dueDate,value}', '')::date,
         review_status = case when auto_verified then 'auto_verified' else 'pending' end,
         updated_at = now()
   where id = target_document_id;

  update public.invoices
     set invoice_type = nullif(extraction #>> '{invoiceType,value}', 'unknown'),
         supplier_name = nullif(extraction #>> '{supplierName,value}', ''),
         customer_name = nullif(extraction #>> '{customerName,value}', ''),
         invoice_number = nullif(extraction #>> '{invoiceNumber,value}', ''),
         invoice_date = nullif(extraction #>> '{invoiceDate,value}', '')::date,
         due_date = nullif(extraction #>> '{dueDate,value}', '')::date,
         currency = nullif(extraction #>> '{currency,value}', ''),
         subtotal = subtotal_value,
         vat_amount = vat_value,
         total = total_value,
         description = nullif(extraction #>> '{description,value}', ''),
         extraction_confidence = min_core_confidence,
         review_status = case when auto_verified then 'auto_verified' else 'pending' end,
         updated_at = now()
   where id = target_invoice_id;

  update public.invoice_processing_jobs
     set status = case when auto_verified then 'completed' else 'needs_review' end,
         error_code = null,
         completed_at = now(),
         updated_at = now()
   where invoice_id = target_invoice_id;

  insert into public.audit_logs(
    company_id, actor_user_id, action, entity_type, entity_id, metadata_json
  ) values (
    target_company_id,
    null,
    'invoice_extracted',
    'invoice',
    target_invoice_id,
    jsonb_build_object(
      'model_version', extraction_model_version,
      'method', extraction_method_name,
      'minimum_core_confidence', min_core_confidence,
      'arithmetic_check', arithmetic_status,
      'auto_verified', auto_verified,
      'requires_human_review', not auto_verified,
      'confidence_gate_version', 'v1-conservative-2026-09-02'
    )
  );
end;
$$;

revoke all on function public.apply_validated_invoice_extraction(uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.apply_validated_invoice_extraction(uuid, jsonb, text, text) to service_role;

commit;
