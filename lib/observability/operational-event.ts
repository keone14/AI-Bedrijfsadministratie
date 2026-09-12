import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type OperationalEvent = {
  companyId?: string | null;
  eventType:
    | "upload_completed"
    | "upload_failed"
    | "extraction_started"
    | "extraction_completed"
    | "extraction_failed"
    | "authorization_denied"
    | "api_request"
    | "calculation_error";
  routeKey: string;
  outcome: "success" | "failure" | "denied" | "accepted";
  durationMs?: number | null;
  statusCode?: number | null;
  errorCode?: string | null;
  entityId?: string | null;
};

export async function recordOperationalEvent(event: OperationalEvent) {
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.rpc("record_operational_event", {
      target_company_id: event.companyId ?? null,
      target_event_type: event.eventType,
      target_route_key: event.routeKey,
      target_outcome: event.outcome,
      target_duration_ms: event.durationMs ?? null,
      target_status_code: event.statusCode ?? null,
      target_error_code: event.errorCode ?? null,
      target_entity_id: event.entityId ?? null,
    });
    if (error) {
      console.error("Operational event write failed", { routeKey: event.routeKey, eventType: event.eventType });
    }
  } catch {
    console.error("Operational event write failed", { routeKey: event.routeKey, eventType: event.eventType });
  }
}
