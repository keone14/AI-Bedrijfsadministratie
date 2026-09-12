#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="ai-bedrijfsadministratie"
DB_CONTAINER="supabase_db_${PROJECT_ID}"
trap 'supabase stop --no-backup >/dev/null 2>&1 || true' EXIT

run_psql() {
  docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"
}

scalar() {
  run_psql -Atc "$1" | tr -d '\r\n'
}

echo "Starting fresh local Supabase security drill..."
supabase start
supabase db reset --local --no-seed

echo "Checking private rate-limit privileges..."
test "$(scalar "select has_schema_privilege('anon', 'private', 'USAGE')")" = "f"
test "$(scalar "select has_schema_privilege('authenticated', 'private', 'USAGE')")" = "f"
test "$(scalar "select has_table_privilege('anon', 'private.api_rate_limits', 'SELECT')")" = "f"
test "$(scalar "select has_table_privilege('authenticated', 'private.api_rate_limits', 'SELECT')")" = "f"
test "$(scalar "select has_function_privilege('anon', 'public.consume_api_rate_limit(text,text,integer,integer)', 'EXECUTE')")" = "f"
test "$(scalar "select has_function_privilege('authenticated', 'public.consume_api_rate_limit(text,text,integer,integer)', 'EXECUTE')")" = "f"
test "$(scalar "select has_function_privilege('service_role', 'public.consume_api_rate_limit(text,text,integer,integer)', 'EXECUTE')")" = "t"

UNPINNED_DEFINERS="$(scalar "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg where cfg like 'search_path=%')")"
test "$UNPINNED_DEFINERS" = "0"

PUBLIC_DEFINER_EXECUTE="$(scalar "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE')")"
test "$PUBLIC_DEFINER_EXECUTE" = "0"

AUTHENTICATED_DEFINERS="$(run_psql -Atc "select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('authenticated', p.oid, 'EXECUTE') order by 1" | tr '\n' ';')"
echo "Authenticated SECURITY DEFINER allowlist observed: ${AUTHENTICATED_DEFINERS:-<none>}"

echo "Checking atomic fixed-window behavior..."
SCOPE="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
FIRST="$(scalar "select allowed::text || '|' || remaining::text || '|' || retry_after_seconds::text from public.consume_api_rate_limit('${SCOPE}','security_drill',2,60)")"
SECOND="$(scalar "select allowed::text || '|' || remaining::text || '|' || retry_after_seconds::text from public.consume_api_rate_limit('${SCOPE}','security_drill',2,60)")"
THIRD="$(scalar "select allowed::text || '|' || remaining::text || '|' || retry_after_seconds::text from public.consume_api_rate_limit('${SCOPE}','security_drill',2,60)")"

test "$FIRST" = "true|1|0"
test "$SECOND" = "true|0|0"
case "$THIRD" in
  false\|0\|*) ;;
  *) echo "Expected third request to be rate-limited, got: $THIRD" >&2; exit 1 ;;
esac
THIRD_RETRY="${THIRD##*|}"
test "$THIRD_RETRY" -ge 1
test "$THIRD_RETRY" -le 60

run_psql -c "update private.api_rate_limits set window_started_at = statement_timestamp() - interval '61 seconds' where scope_hash='${SCOPE}' and action='security_drill';" >/dev/null
RESET="$(scalar "select allowed::text || '|' || remaining::text || '|' || retry_after_seconds::text from public.consume_api_rate_limit('${SCOPE}','security_drill',2,60)")"
test "$RESET" = "true|1|0"

echo "SECURITY_DRILL_PASS private_acl=ok definer_search_path=ok public_execute=ok rate_limit=ok"
