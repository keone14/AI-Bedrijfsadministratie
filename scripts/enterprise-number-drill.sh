#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="ai-bedrijfsadministratie"
DB_CONTAINER="supabase_db_${PROJECT_ID}"
trap 'supabase stop --no-backup >/dev/null 2>&1 || true' EXIT

run_psql() {
  docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"
}

echo "Starting clean local Supabase stack..."
supabase start
supabase db reset --local --no-seed

echo "Checking valid Belgian enterprise-number shapes..."
run_psql <<'SQL'
insert into public.companies (name, enterprise_number, profile_status)
values
  ('Enterprise zero prefix', '0123456789', 'incomplete'),
  ('Enterprise one prefix', '1234567890', 'incomplete'),
  ('Enterprise unknown', null, 'incomplete');
SQL

echo "Checking that a 10-digit establishment-unit-shaped number is rejected..."
if run_psql <<'SQL'
insert into public.companies (name, enterprise_number, profile_status)
values ('Wrong identifier type', '2123456789', 'incomplete');
SQL
then
  echo "ERROR: number starting with 2 was accepted as an enterprise number" >&2
  exit 1
fi

echo "Checking that incomplete enterprise numbers are rejected..."
if run_psql <<'SQL'
insert into public.companies (name, enterprise_number, profile_status)
values ('Too short', '012345678', 'incomplete');
SQL
then
  echo "ERROR: 9-digit enterprise number was accepted" >&2
  exit 1
fi

echo "Checking that non-digit enterprise numbers are rejected..."
if run_psql <<'SQL'
insert into public.companies (name, enterprise_number, profile_status)
values ('Invalid characters', '0ABC456789', 'incomplete');
SQL
then
  echo "ERROR: enterprise number containing letters was accepted" >&2
  exit 1
fi

echo "ENTERPRISE_NUMBER_GUARD_PASS"
