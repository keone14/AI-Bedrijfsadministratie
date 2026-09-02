import { z } from "zod";

const confidence = z.number().min(0).max(1);

const textField = z.object({
  value: z.string().trim().min(1).nullable(),
  confidence,
});

const dateField = z.object({
  value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  confidence,
});

const moneyField = z.object({
  value: z.number().finite().nullable(),
  confidence,
});

export const invoiceExtractionSchema = z.object({
  documentType: z.object({
    value: z.enum(["invoice", "credit_note", "other", "unknown"]),
    confidence,
  }),
  supplierName: textField,
  customerName: textField,
  invoiceNumber: textField,
  invoiceDate: dateField,
  dueDate: dateField,
  subtotal: moneyField,
  vatAmount: moneyField,
  total: moneyField,
  currency: z.object({
    value: z.string().regex(/^[A-Z]{3}$/).nullable(),
    confidence,
  }),
  description: textField,
  invoiceType: z.object({
    value: z.enum(["purchase", "sale", "unknown"]),
    confidence,
  }),
});

export type InvoiceExtraction = z.infer<typeof invoiceExtractionSchema>;

export const invoiceExtractionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "documentType",
    "supplierName",
    "customerName",
    "invoiceNumber",
    "invoiceDate",
    "dueDate",
    "subtotal",
    "vatAmount",
    "total",
    "currency",
    "description",
    "invoiceType",
  ],
  properties: {
    documentType: enumField(["invoice", "credit_note", "other", "unknown"]),
    supplierName: nullableStringField(),
    customerName: nullableStringField(),
    invoiceNumber: nullableStringField(),
    invoiceDate: nullableDateField(),
    dueDate: nullableDateField(),
    subtotal: nullableNumberField(),
    vatAmount: nullableNumberField(),
    total: nullableNumberField(),
    currency: nullableCurrencyField(),
    description: nullableStringField(),
    invoiceType: enumField(["purchase", "sale", "unknown"]),
  },
} as const;

function confidenceProperty() {
  return { type: "number", minimum: 0, maximum: 1 } as const;
}

function nullableStringField() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["value", "confidence"],
    properties: {
      value: { type: ["string", "null"] },
      confidence: confidenceProperty(),
    },
  } as const;
}

function nullableDateField() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["value", "confidence"],
    properties: {
      value: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      confidence: confidenceProperty(),
    },
  } as const;
}

function nullableNumberField() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["value", "confidence"],
    properties: {
      value: { type: ["number", "null"] },
      confidence: confidenceProperty(),
    },
  } as const;
}

function nullableCurrencyField() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["value", "confidence"],
    properties: {
      value: { type: ["string", "null"], pattern: "^[A-Z]{3}$" },
      confidence: confidenceProperty(),
    },
  } as const;
}

function enumField(values: readonly string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["value", "confidence"],
    properties: {
      value: { type: "string", enum: values },
      confidence: confidenceProperty(),
    },
  } as const;
}

export function validateInvoiceExtraction(input: unknown) {
  return invoiceExtractionSchema.safeParse(input);
}

export function arithmeticCheck(extraction: InvoiceExtraction) {
  const subtotal = extraction.subtotal.value;
  const vat = extraction.vatAmount.value;
  const total = extraction.total.value;

  if (subtotal === null || vat === null || total === null) {
    return { status: "incomplete" as const, difference: null };
  }

  const difference = Math.abs(subtotal + vat - total);
  return {
    status: difference <= 0.02 ? ("ok" as const) : ("mismatch" as const),
    difference: Number(difference.toFixed(2)),
  };
}

export function minimumCoreConfidence(extraction: InvoiceExtraction) {
  const core = [
    extraction.documentType.confidence,
    extraction.supplierName.confidence,
    extraction.invoiceDate.confidence,
    extraction.total.confidence,
    extraction.invoiceType.confidence,
  ];
  return Math.min(...core);
}
