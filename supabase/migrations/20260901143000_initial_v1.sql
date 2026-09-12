begin;

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  enterprise_number text,
  legal_form text,
  occupation_status text,
  vat_status text,
  vat_frequency text,
  activity_description_raw text,
  activity_normalized text,
  sells_products_services text,
  employee_status text,
  start_date date,
  profile_status text not null default 'incomplete',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint enterprise_number_format check (enterprise_number is null or enterprise_number ~ '^[0-9]{10}$')
);

create table if not exists public.company_members (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create or replace function public.is_company_member(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.company_members cm
    where cm.company_id = target_company_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
  );
$$;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  simple_label text not null unique,
  description_simple text,
  internal_code text,
  active boolean not null default true
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id),
  original_filename text not null,
  display_name text,
  mime_type text not null,
  storage_path text not null unique,
  file_hash text,
  document_type text,
  document_type_confidence numeric(5,4),
  processing_status text not null default 'uploaded',
  extracted_text_reference text,
  detected_date date,
  detected_expiry_date date,
  review_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  document_id uuid not null unique references public.documents(id) on delete cascade,
  invoice_type text,
  supplier_name text,
  customer_name text,
  invoice_number text,
  invoice_date date,
  due_date date,
  currency text not null default 'EUR',
  subtotal numeric(14,2),
  vat_amount numeric(14,2),
  total numeric(14,2),
  category_id uuid references public.categories(id),
  extraction_confidence numeric(5,4),
  category_confidence numeric(5,4),
  review_status text not null default 'pending',
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoice_extractions (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  field_name text not null,
  proposed_value_json jsonb,
  normalized_value_json jsonb,
  confidence numeric(5,4),
  extraction_method text,
  model_version text,
  user_confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.category_preferences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_pattern text not null,
  preferred_category_id uuid not null references public.categories(id),
  source text not null default 'user_correction',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, supplier_pattern)
);

create table if not exists public.rule_references (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null default 'BE',
  rule_type text not null,
  subject text,
  simple_explanation text,
  official_term text,
  source_name text not null,
  source_url text not null,
  effective_from date,
  effective_to date,
  last_verified_at timestamptz not null,
  applicability_json jsonb not null default '{}'::jsonb,
  version text not null,
  status text not null default 'verified',
  impact_level text not null default 'info',
  created_at timestamptz not null default now()
);

create table if not exists public.deadlines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  type text not null,
  simple_title text not null,
  official_title text,
  due_date date not null,
  status text not null default 'open',
  source_type text,
  rule_reference_id uuid references public.rule_references(id),
  applicability_status text not null default 'verified',
  completed_at timestamptz,
  completed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  severity text not null,
  type text not null,
  title text not null,
  message text not null,
  related_entity_type text,
  related_entity_id uuid,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_json jsonb,
  after_json jsonb,
  metadata_json jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_interactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  interaction_type text not null,
  model_version text,
  data_entity_refs jsonb,
  rule_refs jsonb,
  status text not null,
  created_at timestamptz not null default now()
);

insert into public.categories(simple_label, description_simple, internal_code) values
('Inkomsten','Geld dat je bedrijf verdient.','income'),
('Materiaal','Materiaal en aankopen voor je werk.','materials'),
('Software','Software en online tools.','software'),
('Telefoon & internet','Telecomkosten voor je bedrijf.','telecom'),
('Reclame & marketing','Advertenties en marketingkosten.','marketing'),
('Auto','Zakelijke autokosten.','vehicle'),
('Brandstof','Brandstofkosten.','fuel'),
('Verzending & transport','Verzending en transport.','shipping'),
('Betaalkosten','Kosten van betaalproviders en transacties.','payment_fees'),
('Kantoor','Kantoorbenodigdheden en werkplek.','office'),
('Verzekeringen','Zakelijke verzekeringen.','insurance'),
('Professionele diensten','Accountant, jurist, consultant en gelijkaardige diensten.','professional_services'),
('Restaurant','Zakelijke restaurantkosten.','restaurant'),
('Reizen','Zakelijke reis- en verblijfskosten.','travel'),
('Personeel','Personeelsgerelateerde kosten.','staff'),
('Andere','Nog niet passend in een andere eenvoudige categorie.','other')
on conflict (simple_label) do nothing;

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.documents enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_extractions enable row level security;
alter table public.category_preferences enable row level security;
alter table public.deadlines enable row level security;
alter table public.alerts enable row level security;
alter table public.audit_logs enable row level security;
alter table public.ai_interactions enable row level security;

create policy "profiles_self" on public.profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "companies_member_read" on public.companies for select using (public.is_company_member(id));
create policy "companies_member_update" on public.companies for update using (public.is_company_member(id)) with check (public.is_company_member(id));
create policy "company_members_member_read" on public.company_members for select using (public.is_company_member(company_id));
create policy "documents_member_all" on public.documents for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
create policy "invoices_member_all" on public.invoices for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
create policy "invoice_extractions_member_all" on public.invoice_extractions for all using (exists (select 1 from public.invoices i where i.id = invoice_id and public.is_company_member(i.company_id))) with check (exists (select 1 from public.invoices i where i.id = invoice_id and public.is_company_member(i.company_id)));
create policy "category_preferences_member_all" on public.category_preferences for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
create policy "deadlines_member_all" on public.deadlines for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
create policy "alerts_member_all" on public.alerts for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));
create policy "audit_logs_member_read" on public.audit_logs for select using (company_id is not null and public.is_company_member(company_id));
create policy "ai_interactions_member_all" on public.ai_interactions for all using (public.is_company_member(company_id)) with check (public.is_company_member(company_id));

create or replace function public.create_company_with_owner(
  company_name text,
  enterprise_no text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_company_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  insert into public.companies(name, enterprise_number)
  values (company_name, nullif(regexp_replace(coalesce(enterprise_no,''), '[^0-9]', '', 'g'), ''))
  returning id into new_company_id;

  insert into public.company_members(company_id, user_id, role, status)
  values (new_company_id, auth.uid(), 'owner', 'active');

  insert into public.audit_logs(company_id, actor_user_id, action, entity_type, entity_id, after_json)
  values (new_company_id, auth.uid(), 'company_created', 'company', new_company_id, jsonb_build_object('name', company_name));

  return new_company_id;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

insert into storage.buckets(id, name, public)
values ('company-documents', 'company-documents', false)
on conflict (id) do update set public = false;

create policy "company_storage_read" on storage.objects for select
using (bucket_id = 'company-documents' and public.is_company_member(((storage.foldername(name))[1])::uuid));

create policy "company_storage_insert" on storage.objects for insert
with check (bucket_id = 'company-documents' and public.is_company_member(((storage.foldername(name))[1])::uuid));

create policy "company_storage_update" on storage.objects for update
using (bucket_id = 'company-documents' and public.is_company_member(((storage.foldername(name))[1])::uuid))
with check (bucket_id = 'company-documents' and public.is_company_member(((storage.foldername(name))[1])::uuid));

create policy "company_storage_delete" on storage.objects for delete
using (bucket_id = 'company-documents' and public.is_company_member(((storage.foldername(name))[1])::uuid));

commit;
