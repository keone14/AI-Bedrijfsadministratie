begin;

alter table public.invoice_field_corrections
  drop constraint if exists invoice_field_corrections_field_name_check;

alter table public.invoice_field_corrections
  add constraint invoice_field_corrections_field_name_check check (
    field_name in (
      'documentType','supplierName','customerName','invoiceNumber','invoiceDate','dueDate',
      'subtotal','vatAmount','total','currency','description','invoiceType','categoryId'
    )
  );

create or replace function public.correct_invoice_fields(
  target_invoice_id uuid,
  corrections jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid;
  target_document_id uuid;
  current_status text;
  current_approved_by uuid;
  field_name text;
  raw_value jsonb;
  previous_value jsonb;
  changed_fields text[] := array[]::text[];
  text_value text;
  numeric_value numeric;
  category_value uuid;
  category_was_corrected boolean := false;
  effective_supplier text;
  preference_saved boolean := false;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if corrections is null or jsonb_typeof(corrections) <> 'object' or corrections = '{}'::jsonb then
    raise exception 'at least one correction is required';
  end if;

  select i.company_id, i.document_id, i.review_status, i.approved_by
    into target_company_id, target_document_id, current_status, current_approved_by
    from public.invoices i
   where i.id = target_invoice_id;

  if target_company_id is null or not public.is_company_member(target_company_id) then
    raise exception 'invoice access denied';
  end if;

  if current_status = 'confirmed' or current_approved_by is not null then
    raise exception 'confirmed invoice cannot be edited without a reopen flow';
  end if;

  if not exists (select 1 from public.invoice_extractions e where e.invoice_id = target_invoice_id) then
    raise exception 'no extraction available to correct';
  end if;

  perform set_config('app.trusted_invoice_extraction', 'on', true);

  for field_name, raw_value in select key, value from jsonb_each(corrections)
  loop
    if field_name not in (
      'documentType','supplierName','customerName','invoiceNumber','invoiceDate','dueDate',
      'subtotal','vatAmount','total','currency','description','invoiceType','categoryId'
    ) then
      raise exception 'unsupported correction field %', field_name;
    end if;

    case field_name
      when 'supplierName' then
        previous_value := to_jsonb((select supplier_name from public.invoices where id = target_invoice_id));
        text_value := case when raw_value = 'null'::jsonb then null else nullif(btrim(raw_value #>> '{}'), '') end;
        if text_value is not null and length(text_value) > 500 then raise exception 'supplier name too long'; end if;
        update public.invoices set supplier_name = text_value, updated_at = now() where id = target_invoice_id;
      when 'customerName' then
        previous_value := to_jsonb((select customer_name from public.invoices where id = target_invoice_id));
        text_value := case when raw_value = 'null'::jsonb then null else nullif(btrim(raw_value #>> '{}'), '') end;
        if text_value is not null and length(text_value) > 500 then raise exception 'customer name too long'; end if;
        update public.invoices set customer_name = text_value, updated_at = now() where id = target_invoice_id;
      when 'invoiceNumber' then
        previous_value := to_jsonb((select invoice_number from public.invoices where id = target_invoice_id));
        text_value := case when raw_value = 'null'::jsonb then null else nullif(btrim(raw_value #>> '{}'), '') end;
        if text_value is not null and length(text_value) > 200 then raise exception 'invoice number too long'; end if;
        update public.invoices set invoice_number = text_value, updated_at = now() where id = target_invoice_id;
      when 'invoiceDate' then
        previous_value := to_jsonb((select invoice_date from public.invoices where id = target_invoice_id));
        text_value := case when raw_value = 'null'::jsonb then null else raw_value #>> '{}' end;
        if text_value is not null and text_value !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid invoice date'; end if;
        update public.invoices set invoice_date = text_value::date, updated_at = now() where id = target_invoice_id;
        update public.documents set detected_date = text_value::date, updated_at = now() where id = target_document_id;
      when 'dueDate' then
        previous_value := to_jsonb((select due_date from public.invoices where id = target_invoice_id));
        text_value := case when raw_value = 'null'::jsonb then null else raw_value #>> '{}' end;
        if text_value is not null and text_value !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid due date'; end if;
        update public.invoices set due_date = text_value::date, updated_at = now() where id = target_invoice_id;
        update public.documents set detected_expiry_date = text_value::date, updated_at = now() where id = target_document_id;
      when 'subtotal' then
        previous_value := to_jsonb((select subtotal from public.invoices where id = target_invoice_id));
        numeric_value := case when raw_value = 'null'::jsonb then null else (raw_value #>> '{}')::numeric end;
        if numeric_value is not null and abs(numeric_value) > 1000000000000 then raise exception 'subtotal outside allowed range'; end if;
        update public.invoices set subtotal = numeric_value, updated_at = now() where id = target_invoice_id;
      when 'vatAmount' then
        previous_value := to_jsonb((select vat_amount from public.invoices where id = target_invoice_id));
        numeric_value := case when raw_value = 'null'::jsonb then null else (raw_value #>> '{}')::numeric end;
        if numeric_value is not null and abs(numeric_value) > 1000000000000 then raise exception 'vat amount outside allowed range'; end if;
        update public.invoices set vat_amount = numeric_value, updated_at = now() where id = target_invoice_id;
      when 'total' then
        previous_value := to_jsonb((select total from public.invoices where id = target_invoice_id));
        numeric_value := case when raw_value = 'null'::jsonb then null else (raw_value #>> '{}')::numeric end;
        if numeric_value is not null and abs(numeric_value) > 1000000000000 then raise exception 'total outside allowed range'; end if;
        update public.invoices set total = numeric_value, updated_at = now() where id = target_invoice_id;
      when 'currency' then
        previous_value := to_jsonb((select currency from public.invoices where id = target_invoice_id));
        text_value := case when raw_value = 'null'::jsonb then null else upper(btrim(raw_value #>> '{}')) end;
        if text_value is not null and text_value !~ '^[A-Z]{3}$' then raise exception 'invalid currency'; end if;
        update public.invoices set currency = text_value, updated_at = now() where id = target_invoice_id;
      when 'description' then
        previous_value := to_jsonb((select description from public.invoices where id = target_invoice_id));
        text_value := case when raw_value = 'null'::jsonb then null else nullif(btrim(raw_value #>> '{}'), '') end;
        if text_value is not null and length(text_value) > 2000 then raise exception 'description too long'; end if;
        update public.invoices set description = text_value, updated_at = now() where id = target_invoice_id;
      when 'invoiceType' then
        previous_value := to_jsonb((select invoice_type from public.invoices where id = target_invoice_id));
        text_value := case when raw_value = 'null'::jsonb then null else raw_value #>> '{}' end;
        if text_value is not null and text_value not in ('purchase','sale') then raise exception 'invalid invoice type'; end if;
        update public.invoices set invoice_type = text_value, updated_at = now() where id = target_invoice_id;
      when 'documentType' then
        previous_value := to_jsonb((select document_type from public.documents where id = target_document_id));
        text_value := case when raw_value = 'null'::jsonb then null else raw_value #>> '{}' end;
        if text_value is not null and text_value not in ('invoice','credit_note') then raise exception 'invalid document type'; end if;
        update public.documents set document_type = text_value, updated_at = now() where id = target_document_id;
      when 'categoryId' then
        previous_value := to_jsonb((select category_id from public.invoices where id = target_invoice_id));
        category_value := case when raw_value = 'null'::jsonb then null else (raw_value #>> '{}')::uuid end;
        if category_value is not null and not exists (
          select 1 from public.categories c where c.id = category_value and c.active = true
        ) then
          raise exception 'invalid category';
        end if;
        update public.invoices
           set category_id = category_value,
               category_confidence = null,
               updated_at = now()
         where id = target_invoice_id;
        category_was_corrected := true;
    end case;

    insert into public.invoice_field_corrections(
      company_id, invoice_id, field_name, previous_effective_value_json, corrected_value_json, corrected_by
    ) values (
      target_company_id, target_invoice_id, field_name, previous_value, raw_value, auth.uid()
    );

    changed_fields := array_append(changed_fields, field_name);
  end loop;

  if category_was_corrected and category_value is not null then
    select nullif(lower(btrim(i.supplier_name)), '')
      into effective_supplier
      from public.invoices i
     where i.id = target_invoice_id;

    if effective_supplier is not null then
      insert into public.category_preferences(
        company_id, supplier_pattern, preferred_category_id, source, created_at, updated_at
      ) values (
        target_company_id, effective_supplier, category_value, 'user_correction', now(), now()
      )
      on conflict (company_id, supplier_pattern)
      do update set
        preferred_category_id = excluded.preferred_category_id,
        source = 'user_correction',
        updated_at = now();
      preference_saved := true;
    end if;
  end if;

  update public.invoices
     set review_status = 'pending', updated_at = now()
   where id = target_invoice_id;

  update public.documents
     set review_status = 'pending', processing_status = 'needs_review', updated_at = now()
   where id = target_document_id;

  update public.invoice_processing_jobs
     set status = 'needs_review', completed_at = now(), updated_at = now()
   where invoice_id = target_invoice_id;

  insert into public.audit_logs(
    company_id, actor_user_id, action, entity_type, entity_id, metadata_json
  ) values (
    target_company_id,
    auth.uid(),
    'invoice_fields_corrected',
    'invoice',
    target_invoice_id,
    jsonb_build_object(
      'fields', to_jsonb(changed_fields),
      'correction_count', cardinality(changed_fields),
      'category_preference_saved', preference_saved
    )
  );
end;
$$;

revoke all on function public.correct_invoice_fields(uuid, jsonb) from public, anon;
grant execute on function public.correct_invoice_fields(uuid, jsonb) to authenticated;

commit;
