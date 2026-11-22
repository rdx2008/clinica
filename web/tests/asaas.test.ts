import { test } from "node:test";
import assert from "node:assert/strict";
import {
  baseUrl,
  buildInvoicePayload,
  centsToReais,
  DEFAULT_FISCAL,
  mapInvoiceStatus,
  methodFromBilling,
  parseInvoiceEvent,
  parsePaymentEvent,
  readFiscal,
  renderDescription,
  safeEqual,
} from "../src/lib/asaas-core.ts";

test("ambientes e conversão de valores", () => {
  assert.equal(baseUrl("SANDBOX"), "https://api-sandbox.asaas.com/v3");
  assert.equal(baseUrl("PRODUCTION"), "https://api.asaas.com/v3");
  assert.equal(centsToReais(15075), 150.75);
  assert.equal(methodFromBilling("PIX"), "PIX");
  assert.equal(methodFromBilling("CREDIT_CARD"), "CARTAO");
  assert.equal(methodFromBilling("BOLETO"), "OUTRO");
});

test("webhook de pagamento: lê evento, cobrança e data", () => {
  const e = parsePaymentEvent({
    id: "evt_1",
    event: "PAYMENT_RECEIVED",
    payment: { id: "pay_9", externalReference: "chg_1", status: "RECEIVED", billingType: "PIX", paymentDate: "2026-11-20" },
  });
  assert.equal(e?.eventId, "evt_1");
  assert.equal(e?.paymentId, "pay_9");
  assert.equal(e?.externalReference, "chg_1");
  assert.equal(e?.paymentDate?.toISOString(), "2026-11-20T15:00:00.000Z");
});

test("webhook de pagamento: formatos inválidos viram null", () => {
  assert.equal(parsePaymentEvent(null), null);
  assert.equal(parsePaymentEvent({ event: "INVOICE_AUTHORIZED", payment: { id: "x" } }), null);
  assert.equal(parsePaymentEvent({ event: "PAYMENT_RECEIVED" }), null);
  assert.equal(parsePaymentEvent({ event: "PAYMENT_RECEIVED", payment: {} }), null);
});

test("webhook de nota fiscal: lê status, número e links", () => {
  const e = parseInvoiceEvent({
    id: "evt_2",
    event: "INVOICE_AUTHORIZED",
    invoice: { id: "inv_1", number: 123, pdfUrl: "https://x/p.pdf", xmlUrl: "https://x/p.xml", externalReference: "chg_1" },
  });
  assert.equal(e?.status, "AUTHORIZED");
  assert.equal(e?.number, "123");
  assert.equal(e?.pdfUrl, "https://x/p.pdf");
  assert.equal(parseInvoiceEvent({ event: "PAYMENT_RECEIVED", invoice: { id: "x" } }), null);
});

test("status de nota do gateway vira status local", () => {
  assert.equal(mapInvoiceStatus("AUTHORIZED"), "EMITIDA");
  assert.equal(mapInvoiceStatus("SCHEDULED"), "AGENDADA");
  assert.equal(mapInvoiceStatus("ERROR"), "ERRO");
  assert.equal(mapInvoiceStatus("CANCELED"), "CANCELADA");
  assert.equal(mapInvoiceStatus("PROCESSING_CANCELLATION"), "CANCELANDO");
  assert.equal(mapInvoiceStatus(null), "AGENDADA");
});

test("dados fiscais: leitura segura e descrição com variáveis", () => {
  assert.deepEqual(readFiscal(null), DEFAULT_FISCAL);
  assert.equal(readFiscal({ issPercent: 99 }).issPercent, 0);
  assert.equal(readFiscal({ issPercent: 2.5, retainIss: true }).retainIss, true);
  assert.equal(renderDescription("Sessão em {data} de {paciente}", { data: "20/11/2026", paciente: "Maria" }), "Sessão em 20/11/2026 de Maria");
});

test("corpo da nota: vincula à cobrança quando existe, senão ao cliente", () => {
  const base = { customerId: "cus_1", valueCents: 18000, description: "Sessão", effectiveDate: "2026-11-20", fiscal: { ...DEFAULT_FISCAL, issPercent: 2 }, externalReference: "chg_1" };
  const a = buildInvoicePayload({ ...base, paymentId: "pay_1" });
  assert.equal(a.payment, "pay_1");
  assert.ok(!("customer" in a));
  assert.equal(a.value, 180);
  assert.equal(a.taxes.iss, 2);
  const b = buildInvoicePayload({ ...base, paymentId: null });
  assert.equal(b.customer, "cus_1");
  assert.ok(!("payment" in b));
});

test("comparação de token em tempo constante", () => {
  assert.ok(safeEqual("abc", "abc"));
  assert.ok(!safeEqual("abc", "abd"));
  assert.ok(!safeEqual("abc", "abcd"));
});
