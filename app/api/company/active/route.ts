import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ACTIVE_COMPANY_COOKIE, safeReturnPath } from "@/lib/company/active-company";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url), 303);

  const form = await request.formData();
  const companyId = form.get("companyId");
  const returnTo = safeReturnPath(typeof form.get("returnTo") === "string" ? String(form.get("returnTo")) : null);
  if (typeof companyId !== "string" || !/^[0-9a-f-]{36}$/i.test(companyId)) {
    return NextResponse.redirect(new URL("/bedrijf-kiezen?error=invalid", request.url), 303);
  }

  const { data: membership, error } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("company_id", companyId)
    .eq("status", "active")
    .maybeSingle();

  if (error || !membership) {
    return NextResponse.redirect(new URL("/bedrijf-kiezen?error=access", request.url), 303);
  }

  const response = NextResponse.redirect(new URL(returnTo, request.url), 303);
  response.cookies.set(ACTIVE_COMPANY_COOKIE, companyId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
