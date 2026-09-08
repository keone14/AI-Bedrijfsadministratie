import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import "./facturen.css";

export const dynamic = "force-dynamic";

type CompanyContextState = "ready" | "no_company" | "multiple_companies" | "error";

async function companyContextState(): Promise<CompanyContextState> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const { data: memberships, error } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(2);

    if (error) return "error";
    if (!memberships?.length) return "no_company";
    if (memberships.length > 1) return "multiple_companies";
    return "ready";
  } catch {
    return "error";
  }
}

function SafeCompanyState({ state }: { state: Exclude<CompanyContextState, "ready"> }) {
  const copy = state === "multiple_companies"
    ? {
        title: "Kies eerst welk bedrijf je wilt gebruiken",
        text: "Je hebt toegang tot meerdere bedrijven. We tonen en verwerken bewust geen gemengde factuurlijst. Zo kan een factuur nooit stilletjes bij het verkeerde bedrijf terechtkomen.",
      }
    : state === "no_company"
      ? {
          title: "Stel eerst je bedrijf in",
          text: "Daarna kunnen facturen veilig aan één onderneming worden gekoppeld.",
        }
      : {
          title: "We konden je bedrijfscontext niet veilig bepalen",
          text: "We tonen liever geen facturen dan gegevens van verschillende bedrijven door elkaar. Probeer opnieuw of controleer je bedrijfsgegevens.",
        };

  return (
    <main className="main invoices-main">
      <section className="card invoices-empty-state" role="status">
        <h1>{copy.title}</h1>
        <p className="muted">{copy.text}</p>
        <Link className="button secondary" href="/onboarding">Bedrijfsgegevens bekijken</Link>
      </section>
    </main>
  );
}

export default async function FacturenLayout({ children }: { children: ReactNode }) {
  const state = await companyContextState();
  if (state !== "ready") return <SafeCompanyState state={state} />;
  return children;
}
