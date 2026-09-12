import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeReturnPath } from "@/lib/company/active-company";
import "../dashboard/dashboard.css";

export const dynamic = "force-dynamic";

type CompanyRow = { id: string; name: string; enterprise_number: string | null };

export default async function CompanyChooserPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; error?: string }> }) {
  const params = await searchParams;
  const returnTo = safeReturnPath(params.returnTo);
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships, error: membershipError } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (membershipError) {
    return <main className="main dashboard-main"><section className="card" role="alert"><h1>We konden je bedrijven nu niet betrouwbaar laden</h1><p className="muted">Probeer opnieuw. We kiezen nooit stilletjes een bedrijf voor je als de toegang niet zeker is.</p><Link className="button secondary" href="/dashboard">Terug naar dashboard</Link></section></main>;
  }

  const companyIds = Array.from(new Set((memberships ?? []).map((item) => item.company_id as string)));
  if (!companyIds.length) redirect("/onboarding");
  if (companyIds.length === 1) redirect(returnTo);

  const { data: companies, error: companyError } = await supabase
    .from("companies")
    .select("id, name, enterprise_number")
    .in("id", companyIds)
    .order("name", { ascending: true });

  if (companyError || !companies?.length) {
    return <main className="main dashboard-main"><section className="card" role="alert"><h1>We konden je bedrijven nu niet betrouwbaar laden</h1><p className="muted">Er is niets geselecteerd. Zo voorkomen we dat administratie aan het verkeerde bedrijf wordt gekoppeld.</p><Link className="button secondary" href="/dashboard">Terug naar dashboard</Link></section></main>;
  }

  return (
    <main className="main dashboard-main">
      <header className="dashboard-heading"><div><div className="eyebrow">Bedrijf kiezen</div><h1>Voor welk bedrijf wil je nu werken?</h1><p className="muted">Je keuze bepaalt welke facturen, documenten, deadlines en bedragen je ziet. We mengen bedrijven nooit.</p></div></header>
      {params.error ? <section className="card" role="alert"><strong>Dat bedrijf kon niet veilig worden geselecteerd.</strong><p className="muted">Kies een bedrijf waarvoor je nog actieve toegang hebt.</p></section> : null}
      <section className="dashboard-lower-grid" aria-label="Beschikbare bedrijven">
        {(companies as CompanyRow[]).map((company) => (
          <form key={company.id} className="card" action="/api/company/active" method="post">
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <h2>{company.name}</h2>
            <p className="muted">{company.enterprise_number ? `Ondernemingsnummer ${company.enterprise_number}` : "Ondernemingsnummer nog niet ingevuld"}</p>
            <button className="button" type="submit">Gebruik dit bedrijf</button>
          </form>
        ))}
      </section>
    </main>
  );
}
