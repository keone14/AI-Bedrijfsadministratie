import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

export const ACTIVE_COMPANY_COOKIE = "active_company_id";

export type ActiveCompanyContext =
  | { state: "ready"; companyId: string; companyIds: string[] }
  | { state: "no_company"; companyIds: [] }
  | { state: "selection_required"; companyIds: string[] }
  | { state: "error"; companyIds: string[] };

export async function resolveActiveCompany(
  supabase: SupabaseClient,
  userId: string,
): Promise<ActiveCompanyContext> {
  const { data: memberships, error } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .eq("status", "active");

  if (error) return { state: "error", companyIds: [] };

  const companyIds = Array.from(new Set((memberships ?? []).map((membership) => membership.company_id as string)));
  if (!companyIds.length) return { state: "no_company", companyIds: [] };
  if (companyIds.length === 1) return { state: "ready", companyId: companyIds[0], companyIds };

  const cookieStore = await cookies();
  const selectedCompanyId = cookieStore.get(ACTIVE_COMPANY_COOKIE)?.value;
  if (selectedCompanyId && companyIds.includes(selectedCompanyId)) {
    return { state: "ready", companyId: selectedCompanyId, companyIds };
  }

  return { state: "selection_required", companyIds };
}

export function safeReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}
