begin;

-- Currency is extracted evidence. If the document does not make it reliable, keep
-- it unknown instead of silently treating EUR as fact.
alter table public.invoices
  alter column currency drop not null,
  alter column currency drop default;

create or replace function public.apply_validated_invoice_extraction(
  target_invoice_id uuid,
  extraction jsonb,
  extraction_model_version text,
  extraction_method_name text default 'vision_structured_output'
) returns void
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

  update public.documents
     set document_type = case when document_type_value in ('invoice','credit_note') then document_type_value else 'unknown' end,
         document_type_confidence = (extraction #>> '{documentType,confidence}')::numeric,
         processing_status = 'needs_review',
         detected_date = nullif(extraction #>> '{invoiceDate,value}', '')::date,
         detected_expiry_date = nullif(extraction #>> '{dueDate,value}', '')::date,
         review_status = 'pending',
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
         review_status = 'pending',
         updated_at = now()
   where id = target_invoice_id;

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
      'requires_human_review', true
    )
  );
end;
$$;

revoke all on function public.apply_validated_invoice_extraction(uuid, jsonb, text, text) from public;
revoke all on function public.apply_validated_invoice_extraction(uuid, jsonb, text, text) from anon;
revoke all on function public.apply_validated_invoice_extraction(uuid, jsonb, text, text) from authenticated;
grant execute on function public.apply_validated_invoice_extraction(uuid, jsonb, text, text) to service_role;

commit;
