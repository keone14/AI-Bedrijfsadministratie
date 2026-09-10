import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveActiveCompany } from "@/lib/company/active-company";
import "./facturen.css";

export const dynamic = "force-dynamic";

type CompanyContextState = "ready" | "unauthenticated" | "no_company" | "selection_required" | "error";

async function companyContextState(): Promise<CompanyContextState> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return "unauthenticated";
    const context = await resolveActiveCompany(supabase, user.id);
    return context.state;
  } catch {
    return "error";
  }
}

function SafeCompanyState({ state }: { state: Exclude<CompanyContextState, "ready" | "unauthenticated"> }) {
  const copy = state === "selection_required"
    ? {
        title: "Kies eerst welk bedrijf je wilt gebruiken",
        text: "Je hebt toegang tot meerdere bedrijven. Kies er één zodat facturen, uploads en bedragen altijd bij dezelfde onderneming blijven.",
        href: "/bedrijf-kiezen?returnTo=/facturen",
        action: "Bedrijf kiezen",
      }
    : state === "no_company"
      ? {
          title: "Stel eerst je bedrijf in",
          text: "Daarna kunnen facturen veilig aan één onderneming worden gekoppeld.",
          href: "/onboarding",
          action: "Bedrijf instellen",
        }
      : {
          title: "We konden je bedrijfscontext niet veilig bepalen",
          text: "We tonen liever geen facturen dan gegevens van verschillende bedrijven door elkaar. Probeer opnieuw of controleer je bedrijfsgegevens.",
          href: "/facturen",
          action: "Opnieuw proberen",
        };

  return (
    <main className="main invoices-main">
      <section className="card invoices-empty-state" role="status">
        <h1>{copy.title}</h1>
        <p className="muted">{copy.text}</p>
        <Link className="button secondary" href={copy.href}>{copy.action}</Link>
      </section>
    </main>
  );
}

export default async function FacturenLayout({ children }: { children: ReactNode }) {
  const state = await companyContextState();
  if (state === "unauthenticated") redirect("/login");
  if (state !== "ready") return <SafeCompanyState state={state} />;
  return children;
}
