-- Guard Belgian enterprise identity at the data layer.
-- Official basis checked 2026-09-10: FOD Economie states that a Belgian
-- enterprise number has exactly 10 digits and starts with 0 or 1.
-- Establishment-unit numbers also have 10 digits but start with 2 through 8.
--
-- NOT VALID is intentional: it protects every new/changed value immediately
-- without silently rewriting historical user data that may need human review.

alter table public.companies
  add constraint companies_enterprise_number_official_shape
  check (
    enterprise_number is null
    or enterprise_number ~ '^[01][0-9]{9}$'
  ) not valid;

comment on constraint companies_enterprise_number_official_shape on public.companies is
  'Belgian enterprise number shape: 10 digits, first digit 0 or 1. Source: FOD Economie, checked 2026-09-10. NOT VALID preserves historical rows for explicit review while enforcing new/changed values.';
