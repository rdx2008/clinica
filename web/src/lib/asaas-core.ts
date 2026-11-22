// Regras puras da integração com o Asaas (sem rede e sem banco): testáveis isoladamente.
import { timingSafeEqual } from "node:crypto";

export type AsaasEnv = "SANDBOX" | "PRODUCTION";

export function baseUrl(env: AsaasEnv): string {
  return env === "PRODUCTION" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
}

export function centsToReais(cents: number): number {
  return Math.round(cents) / 100;
}

export function methodFromBilling(billingType: string | undefined): string {
  switch (billingType) {
    case "PIX":
      return "PIX";
    case "CREDIT_CARD":
    case "DEBIT_CARD":
      return "CARTAO";
    default:
      return "OUTRO";
  }
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// ---- Webhook de cobrança ----

export type PaymentEvent = {
  eventId: string;
  event: string;
  paymentId: string;
  externalReference: string | null;
  status: string;
  billingType: string;
  paymentDate: Date | null;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

export function parsePaymentEvent(body: unknown): PaymentEvent | null {
  const j = body as { id?: unknown; event?: unknown; payment?: Record<string, unknown> } | null;
  const event = str(j?.event);
  const p = j?.payment;
  if (!event || !event.startsWith("PAYMENT_") || !p) return null;
  const paymentId = str(p.id);
  if (!paymentId) return null;
  const d = str(p.paymentDate) ?? str(p.confirmedDate) ?? str(p.clientPaymentDate);
  const date = d ? new Date(`${d.slice(0, 10)}T12:00:00.000-03:00`) : null;
  return {
    eventId: str(j?.id) ?? `${event}:${paymentId}`,
    event,
    paymentId,
    externalReference: str(p.externalReference),
    status: str(p.status) ?? "",
    billingType: str(p.billingType) ?? "",
    paymentDate: date && !Number.isNaN(date.getTime()) ? date : null,
  };
}

// ---- Webhook / consulta de nota fiscal ----

export type InvoiceEvent = {
  eventId: string;
  event: string;
  invoiceId: string;
  status: string | null;
  number: string | null;
  pdfUrl: string | null;
  xmlUrl: string | null;
  externalReference: string | null;
  statusDescription: string | null;
};

// O formato do evento de nota não foi confirmado na documentação: leitura tolerante.
export function parseInvoiceEvent(body: unknown): InvoiceEvent | null {
  const j = body as { id?: unknown; event?: unknown; invoice?: Record<string, unknown> } | null;
  const event = str(j?.event);
  const inv = j?.invoice;
  if (!event || !event.startsWith("INVOICE_") || !inv) return null;
  const invoiceId = str(inv.id);
  if (!invoiceId) return null;
  const fromEvent: Record<string, string> = {
    INVOICE_AUTHORIZED: "AUTHORIZED",
    INVOICE_CANCELED: "CANCELED",
    INVOICE_ERROR: "ERROR",
    INVOICE_PROCESSING_CANCELLATION: "PROCESSING_CANCELLATION",
    INVOICE_CANCELLATION_DENIED: "CANCELLATION_DENIED",
  };
  return {
    eventId: str(j?.id) ?? `${event}:${invoiceId}`,
    event,
    invoiceId,
    status: str(inv.status) ?? fromEvent[event] ?? null,
    number: inv.number === undefined || inv.number === null ? null : String(inv.number),
    pdfUrl: str(inv.pdfUrl),
    xmlUrl: str(inv.xmlUrl),
    externalReference: str(inv.externalReference),
    statusDescription: str(inv.statusDescription),
  };
}

export function mapInvoiceStatus(s: string | null | undefined): "AGENDADA" | "EMITIDA" | "CANCELANDO" | "CANCELADA" | "ERRO" {
  switch (s) {
    case "AUTHORIZED":
    case "CANCELLATION_DENIED":
      return "EMITIDA";
    case "PROCESSING_CANCELLATION":
      return "CANCELANDO";
    case "CANCELED":
      return "CANCELADA";
    case "ERROR":
      return "ERRO";
    default:
      return "AGENDADA";
  }
}

// ---- Dados fiscais padrão ----

export type FiscalConfig = {
  municipalServiceName: string;
  municipalServiceCode: string;
  municipalServiceId: string;
  issPercent: number;
  retainIss: boolean;
  descriptionTemplate: string;
};

export const DEFAULT_FISCAL: FiscalConfig = {
  municipalServiceName: "Serviços de psicologia",
  municipalServiceCode: "",
  municipalServiceId: "",
  issPercent: 0,
  retainIss: false,
  descriptionTemplate: "Serviços de psicologia prestados em {data}.",
};

export function readFiscal(json: unknown): FiscalConfig {
  const j = (json ?? {}) as Partial<FiscalConfig>;
  return {
    municipalServiceName: typeof j.municipalServiceName === "string" && j.municipalServiceName ? j.municipalServiceName : DEFAULT_FISCAL.municipalServiceName,
    municipalServiceCode: typeof j.municipalServiceCode === "string" ? j.municipalServiceCode : "",
    municipalServiceId: typeof j.municipalServiceId === "string" ? j.municipalServiceId : "",
    issPercent: typeof j.issPercent === "number" && j.issPercent >= 0 && j.issPercent <= 10 ? j.issPercent : 0,
    retainIss: j.retainIss === true,
    descriptionTemplate: typeof j.descriptionTemplate === "string" && j.descriptionTemplate ? j.descriptionTemplate : DEFAULT_FISCAL.descriptionTemplate,
  };
}

export function renderDescription(template: string, vars: { data: string; paciente?: string }): string {
  return template.replace(/\{data\}/g, vars.data).replace(/\{paciente\}/g, vars.paciente ?? "").slice(0, 1000);
}

// Corpo do POST /v3/invoices (agendar nota de serviço).
export function buildInvoicePayload(p: {
  paymentId: string | null;
  customerId: string;
  valueCents: number;
  description: string;
  effectiveDate: string; // YYYY-MM-DD
  fiscal: FiscalConfig;
  externalReference: string;
}) {
  return {
    ...(p.paymentId ? { payment: p.paymentId } : { customer: p.customerId }),
    serviceDescription: p.description,
    observations: "",
    value: centsToReais(p.valueCents),
    deductions: 0,
    effectiveDate: p.effectiveDate,
    municipalServiceName: p.fiscal.municipalServiceName,
    ...(p.fiscal.municipalServiceCode ? { municipalServiceCode: p.fiscal.municipalServiceCode } : {}),
    ...(p.fiscal.municipalServiceId ? { municipalServiceId: p.fiscal.municipalServiceId } : {}),
    externalReference: p.externalReference,
    updatePayment: false,
    taxes: { retainIss: p.fiscal.retainIss, iss: p.fiscal.issPercent, pis: 0, cofins: 0, csll: 0, inss: 0, ir: 0 },
  };
}
