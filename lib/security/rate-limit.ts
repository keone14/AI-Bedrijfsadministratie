import "server-only";
import { createHash } from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type RateLimitInput = {
  userId: string;
  companyId: string;
  action: string;
  maxRequests: number;
  windowSeconds: number;
};

type RateLimitResult =
  | { state: "allowed"; remaining: number }
  | { state: "limited"; retryAfterSeconds: number }
  | { state: "unavailable" };

type RpcRow = {
  allowed?: boolean;
  remaining?: number;
  retry_after_seconds?: number;
};

export async function consumeRateLimit(input: RateLimitInput): Promise<RateLimitResult> {
  const scopeHash = createHash("sha256")
    .update(`${input.userId}:${input.companyId}:${input.action}`)
    .digest("hex");

  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("consume_api_rate_limit", {
      target_scope_hash: scopeHash,
      target_action: input.action,
      target_max_requests: input.maxRequests,
      target_window_seconds: input.windowSeconds,
    });

    if (error) return { state: "unavailable" };

    const row = (Array.isArray(data) ? data[0] : data) as RpcRow | null;
    if (!row || typeof row.allowed !== "boolean") return { state: "unavailable" };

    if (!row.allowed) {
      return {
        state: "limited",
        retryAfterSeconds: Math.max(1, Number(row.retry_after_seconds) || 1),
      };
    }

    return {
      state: "allowed",
      remaining: Math.max(0, Number(row.remaining) || 0),
    };
  } catch {
    return { state: "unavailable" };
  }
}
