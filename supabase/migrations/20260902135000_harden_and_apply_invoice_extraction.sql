begin;

alter table public.invoices
  add column if not exists description text;

-- Extracted document/invoice state is processing evidence. Browser clients must not
-- be able to rewrite it and make an unverified invoice look processed or correct.
create or replace function public.protect_document_processing_state()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_setting('app.trusted_invoice_extraction', true) = 'on' then
    return new;
  end if;

  if new.document_type is distinct from old.document_type
     or new.document_type_confidence is distinct from old.document_type_confidence
     or new.processing_status is distinct from old.processing_status
     or new.extracted_text_reference is distinct from old.extracted_text_reference
     or new.detected_date is distinct from old.detected_date
     or new.detected_expiry_date is distinct from old.detected_expiry_date
     or new.review_status is distinct from old.review_status then
    raise exception 'document processing fields are server-managed';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_document_processing_state() from public;

drop trigger if exists protect_document_processing_state on public.documents;
create trigger protect_document_processing_state
before update on public.documents
for each row execute function public.protect_document_processing_state();

create or replace function public.protect_invoice_extracted_state()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_setting('app.trusted_invoice_extraction', true) = 'on' then
    return new;
  end if;

  if new.invoice_type is distinct from old.invoice_type
     or new.supplier_name is distinct from old.supplier_name
     or new.customer_name is distinct from old.customer_name
     or new.invoice_number is distinct from old.invoice_number
     or new.invoice_date is distinct from old.invoice_date
     or new.due_date is distinct from old.due_date
     or new.currency is distinct from old.currency
     or new.subtotal is distinct from old.subtotal
     or new.vat_amount is distinct from old.vat_amount
     or new.total is distinct from old.total
     or new.description is distinct from old.description
     or new.category_id is distinct from old.category_id
     or new.extraction_confidence is distinct from old.extraction_confidence
     or new.category_confidence is distinct from old.category_confidence
     or new.review_status is distinct from old.review_status then
    raise exception 'invoice extracted fields are server-managed';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_invoice_extracted_state() from public;

drop trigger if exists protect_invoice_extracted_state on public.invoices;
create trigger protect_invoice_extracted_state
before update on public.invoices
for each row execute function public.protect_invoice_extracted_state();

-- Service-only atomic write for one validated model result. The browser cannot call
-- this function. Human corrections will get their own narrowly scoped RPC later so
-- the original AI evidence remains immutable.
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
         currency = coalesce(nullif(extraction #>> '{currency,value}', ''), 'EUR'),
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
