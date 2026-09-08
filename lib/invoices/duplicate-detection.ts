export type DuplicateInvoiceCandidate = {
  id: string;
  company_id?: string;
  supplier_name: string | null;
  customer_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  total: number | null;
  currency: string | null;
  created_at: string;
};

export function normalizeDuplicateText(value: string | null) {
  return value?.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("nl-BE") ?? "";
}

export function duplicateInvoiceKey(invoice: DuplicateInvoiceCandidate) {
  const counterparty = normalizeDuplicateText(invoice.supplier_name ?? invoice.customer_name);
  const invoiceNumber = normalizeDuplicateText(invoice.invoice_number);
  const currency = normalizeDuplicateText(invoice.currency);
  const total = invoice.total === null ? Number.NaN : Number(invoice.total);

  if (!counterparty || !invoiceNumber || !invoice.invoice_date || !currency || !Number.isFinite(total)) {
    return null;
  }

  const companyScope = invoice.company_id ? `${invoice.company_id}|` : "";
  return `${companyScope}${counterparty}|${invoiceNumber}|${invoice.invoice_date}|${total.toFixed(2)}|${currency}`;
}

export function groupPossibleDuplicateInvoices<T extends DuplicateInvoiceCandidate>(invoices: T[]) {
  const groups = new Map<string, T[]>();

  for (const invoice of invoices) {
    const key = duplicateInvoiceKey(invoice);
    if (!key) continue;

    const current = groups.get(key) ?? [];
    current.push(invoice);
    groups.set(key, current);
  }

  return Array.from(groups.values()).filter((group) => group.length > 1);
}

export function possibleDuplicateInvoiceIds<T extends DuplicateInvoiceCandidate>(invoices: T[]) {
  const duplicateIds = new Set<string>();

  for (const group of groupPossibleDuplicateInvoices(invoices)) {
    const oldestFirst = [...group].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    for (const invoice of oldestFirst.slice(1)) duplicateIds.add(invoice.id);
  }

  return duplicateIds;
}
