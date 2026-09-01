import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const allowedDestinations = new Set(["/onboarding", "/reset-password"]);

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const requestedNext = requestUrl.searchParams.get("next") ?? "/onboarding";
  const destination = allowedDestinations.has(requestedNext) ? requestedNext : "/onboarding";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing-code", request.url));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/login?error=confirm", request.url));
  }

  return NextResponse.redirect(new URL(destination, request.url));
}
