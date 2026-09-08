import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type InvoiceCandidate = {
  id: string;
  company_id: string;
  supplier_name: string | null;
  customer_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  total: number | null;
  currency: string | null;
  created_at: string;
};

const invoicePageSize = 1000;

function normalizeText(value: string | null) {
  return value?.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("nl-BE") ?? "";
}

function duplicateKey(invoice: InvoiceCandidate) {
  const counterparty = normalizeText(invoice.supplier_name ?? invoice.customer_name);
  const invoiceNumber = normalizeText(invoice.invoice_number);
  const currency = normalizeText(invoice.currency);
  const total = invoice.total === null ? Number.NaN : Number(invoice.total);

  if (!counterparty || !invoiceNumber || !invoice.invoice_date || !currency || !Number.isFinite(total)) {
    return null;
  }

  return [
    invoice.company_id,
    counterparty,
    invoiceNumber,
    invoice.invoice_date,
    total.toFixed(2),
    currency,
  ].join("|");
}

function displayCounterparty(invoice: InvoiceCandidate) {
  return invoice.supplier_name ?? invoice.customer_name ?? "Onbekende partij";
}

export default async function InvoiceDuplicateAlerts() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: memberships, error: membershipError } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(2);

  if (membershipError || !memberships?.length || memberships.length !== 1) return null;

  const companyId = memberships[0].company_id as string;
  const invoices: InvoiceCandidate[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("invoices")
      .select("id, company_id, supplier_name, customer_name, invoice_number, invoice_date, total, currency, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .range(offset, offset + invoicePageSize - 1);

    if (error) return null;

    const page = (data ?? []) as InvoiceCandidate[];
    invoices.push(...page);
    if (page.length < invoicePageSize) break;
    offset += invoicePageSize;
  }

  const groups = new Map<string, InvoiceCandidate[]>();

  for (const invoice of invoices) {
    const key = duplicateKey(invoice);
    if (!key) continue;

    const current = groups.get(key) ?? [];
    current.push(invoice);
    groups.set(key, current);
  }

  const duplicateGroups = Array.from(groups.values())
    .filter((group) => group.length > 1)
    .sort((a, b) => Date.parse(b[0]?.created_at ?? "") - Date.parse(a[0]?.created_at ?? ""))
    .slice(0, 5);

  if (!duplicateGroups.length) return null;

  const duplicateCount = duplicateGroups.reduce((count, group) => count + group.length - 1, 0);

  return (
    <section className="card invoice-safety-card" aria-labelledby="duplicate-alert-title">
      <div>
        <div className="eyebrow">Even controleren</div>
        <h2 id="duplicate-alert-title">
          {duplicateCount === 1 ? "1 factuur lijkt mogelijk dubbel" : `${duplicateCount} facturen lijken mogelijk dubbel`}
        </h2>
        <p className="muted">
          We vonden dezelfde partij, hetzelfde factuurnummer, dezelfde datum, dezelfde valuta en hetzelfde totaal. Dat kan een dubbele upload zijn. We verwijderen niets automatisch.
        </p>
      </div>

      <div className="invoice-card-list">
        {duplicateGroups.map((group) => {
          const first = group[0];
          if (!first) return null;

          return (
            <div className="invoice-read-warning" key={duplicateKey(first) ?? first.id}>
              <strong>{displayCounterparty(first)} · factuur {first.invoice_number}</strong>
              <span>{group.length} exemplaren hebben dezelfde kerngegevens. Controleer ze voordat je erop vertrouwt in je administratie.</span>
              <span>
                {group.slice(0, 3).map((candidate, index) => (
                  <span key={candidate.id}>
                    {index > 0 ? " · " : ""}
                    <Link href={`/facturen/${candidate.id}`}>Bekijk exemplaar {index + 1}</Link>
                  </span>
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
