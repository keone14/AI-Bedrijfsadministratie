import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveActiveCompany } from "@/lib/company/active-company";
import {
  duplicateInvoiceKey,
  groupPossibleDuplicateInvoices,
  type DuplicateInvoiceCandidate,
} from "@/lib/invoices/duplicate-detection";

type InvoiceCandidate = DuplicateInvoiceCandidate & {
  company_id: string;
};

const invoicePageSize = 1000;
const visibleDuplicateGroupLimit = 5;

function displayCounterparty(invoice: InvoiceCandidate) {
  return invoice.supplier_name ?? invoice.customer_name ?? "Onbekende partij";
}

function displayInvoiceDate(value: string | null) {
  if (!value) return "datum niet bevestigd";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "datum niet bevestigd";
  return new Intl.DateTimeFormat("nl-BE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(parsed);
}

function displayInvoiceAmount(total: number | null, currency: string | null) {
  if (total === null || !Number.isFinite(total)) return "bedrag niet bevestigd";
  const normalizedCurrency = currency?.trim().toUpperCase() ?? "";
  if (!normalizedCurrency) {
    return `${new Intl.NumberFormat("nl-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(total)} (valuta niet bevestigd)`;
  }
  try {
    return new Intl.NumberFormat("nl-BE", {
      style: "currency",
      currency: normalizedCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(total);
  } catch {
    return `${total.toFixed(2)} ${normalizedCurrency}`;
  }
}

function DuplicateCheckUnavailable() {
  return (
    <section className="card invoice-safety-card" role="status" aria-labelledby="duplicate-check-error-title">
      <div>
        <div className="eyebrow">Controle niet volledig</div>
        <h2 id="duplicate-check-error-title">We konden mogelijke dubbele facturen nu niet betrouwbaar controleren.</h2>
        <p className="muted">
          Je facturen zijn niet verdwenen en we verwijderen niets automatisch. Probeer de pagina opnieuw voordat je ervan uitgaat dat er geen dubbele facturen zijn.
        </p>
      </div>
    </section>
  );
}

export default async function InvoiceDuplicateAlerts() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const company = await resolveActiveCompany(supabase, user.id);
  if (company.state === "error") return <DuplicateCheckUnavailable />;
  if (company.state !== "ready") return null;

  const companyId = company.companyId;
  const invoices: InvoiceCandidate[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("invoices")
      .select("id, company_id, supplier_name, customer_name, invoice_number, invoice_date, total, currency, duplicate_resolution, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .range(offset, offset + invoicePageSize - 1);

    if (error) return <DuplicateCheckUnavailable />;

    const page = (data ?? []) as InvoiceCandidate[];
    invoices.push(...page);
    if (page.length < invoicePageSize) break;
    offset += invoicePageSize;
  }

  const duplicateGroups = groupPossibleDuplicateInvoices(invoices)
    .sort((a, b) => Date.parse(b[0]?.created_at ?? "") - Date.parse(a[0]?.created_at ?? ""));

  if (!duplicateGroups.length) return null;

  const duplicateCount = duplicateGroups.reduce((count, group) => count + group.length - 1, 0);
  const visibleGroups = duplicateGroups.slice(0, visibleDuplicateGroupLimit);
  const hiddenGroupCount = duplicateGroups.length - visibleGroups.length;

  return (
    <section className="card invoice-safety-card" aria-labelledby="duplicate-alert-title">
      <div>
        <div className="eyebrow">Even controleren</div>
        <h2 id="duplicate-alert-title">
          {duplicateCount === 1 ? "1 factuur lijkt mogelijk dubbel" : `${duplicateCount} facturen lijken mogelijk dubbel`}
        </h2>
        <p className="muted">
          We vonden dezelfde partij, hetzelfde factuurnummer, dezelfde datum, dezelfde valuta en hetzelfde totaal. Het oudste exemplaar blijft voorlopig de referentie. Later toegevoegde exemplaren tellen niet mee in betrouwbare dashboardtotalen zolang ze mogelijk dubbel zijn. We verwijderen niets automatisch.
        </p>
      </div>

      <div className="invoice-card-list">
        {visibleGroups.map((group) => {
          const oldestFirst = [...group].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
          const referenceInvoice = oldestFirst[0];
          if (!referenceInvoice) return null;

          const possibleDuplicates = oldestFirst.slice(1);

          return (
            <div className="invoice-read-warning" key={duplicateInvoiceKey(referenceInvoice) ?? referenceInvoice.id}>
              <strong>{displayCounterparty(referenceInvoice)} · factuur {referenceInvoice.invoice_number}</strong>
              <span>
                {displayInvoiceDate(referenceInvoice.invoice_date)} · {displayInvoiceAmount(referenceInvoice.total, referenceInvoice.currency)}
              </span>
              <span>
                Vergelijk eerst de documenten zelf. Als ze werkelijk dezelfde factuur zijn, hoef je het latere exemplaar niet te vertrouwen. Zijn het toch twee verschillende facturen, open dan het mogelijke duplicaat en bevestig daar dat het een aparte factuur is.
              </span>
              <span>
                <Link href={`/facturen/${referenceInvoice.id}`}>Open eerdere factuur (referentie)</Link>
                {possibleDuplicates.slice(0, 2).map((candidate, index) => (
                  <span key={candidate.id}>
                    {" · "}
                    <Link href={`/facturen/${candidate.id}`}>Open mogelijk duplicaat {index + 1}</Link>
                  </span>
                ))}
              </span>
              {possibleDuplicates.length > 2 ? (
                <span>Er zijn nog {possibleDuplicates.length - 2} latere {possibleDuplicates.length - 2 === 1 ? "factuur" : "facturen"} met dezelfde kerngegevens.</span>
              ) : null}
            </div>
          );
        })}
      </div>

      {hiddenGroupCount > 0 ? (
        <p className="muted">Er zijn nog {hiddenGroupCount} andere {hiddenGroupCount === 1 ? "groep" : "groepen"} met mogelijke duplicaten. De teller hierboven bevat ze al.</p>
      ) : null}
    </section>
  );
}
