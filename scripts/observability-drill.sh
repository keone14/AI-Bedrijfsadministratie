#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="ai-bedrijfsadministratie"
DB_CONTAINER="supabase_db_${PROJECT_ID}"
trap 'supabase stop --no-backup >/dev/null 2>&1 || true' EXIT
COMPANY_ID="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
ENTITY_ID="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

run_psql() {
  docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"
}
scalar() {
  run_psql -Atc "$1" | tr -d '\r\n'
}

echo "Starting fresh local Supabase observability drill..."
supabase start
supabase db reset --local --no-seed

run_psql -c "insert into public.companies(id,name,enterprise_number,profile_status) values ('${COMPANY_ID}','Observability Drill BV','0123456789','complete');" >/dev/null

echo "Checking telemetry is private and server-only..."
test "$(scalar "select has_schema_privilege('anon','private','USAGE')")" = "f"
test "$(scalar "select has_schema_privilege('authenticated','private','USAGE')")" = "f"
test "$(scalar "select has_table_privilege('anon','private.operational_events','SELECT')")" = "f"
test "$(scalar "select has_table_privilege('authenticated','private.operational_events','SELECT')")" = "f"
test "$(scalar "select has_function_privilege('anon','public.record_operational_event(uuid,text,text,text,integer,integer,text,uuid)','EXECUTE')")" = "f"
test "$(scalar "select has_function_privilege('authenticated','public.record_operational_event(uuid,text,text,text,integer,integer,text,uuid)','EXECUTE')")" = "f"
test "$(scalar "select has_function_privilege('service_role','public.record_operational_event(uuid,text,text,text,integer,integer,text,uuid)','EXECUTE')")" = "t"
test "$(scalar "select has_function_privilege('authenticated','public.get_operational_metrics_snapshot(timestamptz)','EXECUTE')")" = "f"

PRIVACY_COLUMNS="$(scalar "select count(*) from information_schema.columns where table_schema='private' and table_name='operational_events' and column_name in ('user_id','email','ip','ip_address','filename','prompt','document_content')")"
test "$PRIVACY_COLUMNS" = "0"

echo "Writing synthetic server-side telemetry and checking retention..."
run_psql <<SQL >/dev/null
insert into private.operational_events(company_id,event_type,route_key,outcome,duration_ms,status_code,error_code,entity_id,created_at)
values ('${COMPANY_ID}','api_request','old_event','success',1,200,null,'${ENTITY_ID}',now()-interval '31 days');
select set_config('request.jwt.claims','{"role":"service_role"}',false);
select public.record_operational_event('${COMPANY_ID}','upload_completed','invoice_upload_finalize','success',100,200,null,'${ENTITY_ID}');
select public.record_operational_event('${COMPANY_ID}','upload_failed','invoice_upload_finalize','failure',300,400,'invalid_file_signature','${ENTITY_ID}');
select public.record_operational_event('${COMPANY_ID}','extraction_started','invoice_extract','accepted',25,202,null,'${ENTITY_ID}');
select public.record_operational_event('${COMPANY_ID}','extraction_completed','invoice_extract','success',450,200,null,'${ENTITY_ID}');
select public.record_operational_event('${COMPANY_ID}','authorization_denied','invoice_extract','denied',40,404,'invoice_not_available','${ENTITY_ID}');
select public.record_operational_event('${COMPANY_ID}','api_request','invoice_upload_finalize','success',100,200,null,'${ENTITY_ID}');
select public.record_operational_event('${COMPANY_ID}','api_request','invoice_upload_finalize','failure',300,400,'invalid_file_signature','${ENTITY_ID}');
select public.record_operational_event('${COMPANY_ID}','calculation_error','dashboard_summary','failure',15,500,'calculation_mismatch',null);
SQL

test "$(scalar "select count(*) from private.operational_events where created_at < now()-interval '30 days'")" = "0"

echo "Checking metrics snapshot values..."
SNAPSHOT="$(scalar "select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false); select public.get_operational_metrics_snapshot(now()-interval '1 hour')::text")"
SNAPSHOT="$(printf '%s' "$SNAPSHOT" | tail -n 1)"
printf '%s' "$SNAPSHOT" | jq -e '.uploads.completed == 1 and .uploads.failed == 1 and .uploads.success_rate == 50.00' >/dev/null
printf '%s' "$SNAPSHOT" | jq -e '.extractions.started == 1 and .extractions.completed == 1 and .extractions.failed == 0 and .extractions.success_rate == 100.00' >/dev/null
printf '%s' "$SNAPSHOT" | jq -e '.authorization_denied == 1 and .calculation_errors == 1 and .average_api_latency_ms == 200.0' >/dev/null
printf '%s' "$SNAPSHOT" | jq -e 'has("failed_jobs") and has("average_processing_ms") and has("needs_review_percent") and has("field_corrections")' >/dev/null

echo "OBSERVABILITY_DRILL_PASS private_acl=ok privacy_fields=ok retention=ok metrics=ok"
