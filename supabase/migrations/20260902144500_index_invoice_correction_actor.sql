begin;

create index if not exists invoice_field_corrections_corrected_by_idx
  on public.invoice_field_corrections(corrected_by);

commit;
