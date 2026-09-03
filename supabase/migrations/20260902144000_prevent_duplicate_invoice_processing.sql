begin;

create or replace function public.mark_invoice_processing(
  target_invoice_id uuid,
  target_provider text,
  target_model_version text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid;
  job_id uuid;
  existing_status text;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'service role required';
  end if;

  select company_id into target_company_id
    from public.invoices
   where id = target_invoice_id;

  if target_company_id is null then
    raise exception 'invoice not found';
  end if;

  select status into existing_status
    from public.invoice_processing_jobs
   where invoice_id = target_invoice_id
   for update;

  if existing_status is not null and existing_status <> 'failed' then
    raise exception 'invoice processing already started';
  end if;

  if existing_status = 'failed' then
    update public.invoice_processing_jobs
       set status = 'processing',
           provider = target_provider,
           model_version = target_model_version,
           started_at = now(),
           completed_at = null,
           error_code = null,
           retry_count = retry_count + 1,
           updated_at = now()
     where invoice_id = target_invoice_id
     returning id into job_id;
  else
    insert into public.invoice_processing_jobs(
      company_id, invoice_id, status, provider, model_version, started_at, error_code, updated_at
    ) values (
      target_company_id, target_invoice_id, 'processing', target_provider, target_model_version, now(), null, now()
    ) returning id into job_id;
  end if;

  return job_id;
end;
$$;

revoke all on function public.mark_invoice_processing(uuid, text, text) from public, anon, authenticated;
grant execute on function public.mark_invoice_processing(uuid, text, text) to service_role;

commit;
