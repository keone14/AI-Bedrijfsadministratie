import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Je sessie is verlopen. Log opnieuw in." }, { status: 401 });
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (membershipError || !memberships?.length) {
    return NextResponse.json({ error: "Dit document kon niet veilig aan een toegankelijk bedrijf gekoppeld worden." }, { status: 403 });
  }

  const companyIds = memberships.map((membership) => membership.company_id as string);
  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select("id, company_id, storage_path")
    .eq("id", documentId)
    .in("company_id", companyIds)
    .maybeSingle();

  if (documentError || !document?.storage_path) {
    return NextResponse.json({ error: "Document niet gevonden of niet toegankelijk." }, { status: 404 });
  }

  const expectedPrefix = `company/${document.company_id}/documents/${document.id}/`;
  if (!document.storage_path.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: "De opslaglocatie van dit document is niet betrouwbaar." }, { status: 403 });
  }

  const { data: signed, error: signedUrlError } = await supabase.storage
    .from("company-documents")
    .createSignedUrl(document.storage_path, 60);

  if (signedUrlError || !signed?.signedUrl) {
    return NextResponse.json({ error: "Het originele document kon nu niet veilig geopend worden." }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl, 302);
}
