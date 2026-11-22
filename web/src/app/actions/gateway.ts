"use server";

import { randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { decryptField, encryptField } from "@/lib/crypto";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";
import { asaas, createPixForCharge, issueInvoiceForCharge, loadAsaas } from "@/lib/asaas";
import { DEFAULT_FISCAL, mapInvoiceStatus } from "@/lib/asaas-core";

const PAGE = "/configuracoes/pagamentos";

function back(msg?: string, ok?: string): never {
  redirect(`${PAGE}${msg ? `?erro=${encodeURIComponent(msg)}` : ok ? `?ok=${encodeURIComponent(ok)}` : ""}`);
}

async function patientCpf(clinicId: string, patientId: string): Promise<string | null> {
  const p = await db.patient.findFirst({ where: { id: patientId, clinicId }, select: { cpfEnc: true } });
  return p?.cpfEnc ? decryptField(p.cpfEnc) : null;
}

// ---- Configuração da conta e dados fiscais ----

export async function saveGatewayAction(formData: FormData) {
  const user = await requireRole("ADMIN");
  const env = formData.get("environment") === "PRODUCTION" ? "PRODUCTION" : "SANDBOX";
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const existing = await db.paymentAccount.findUnique({ where: { clinicId: user.clinicId } });
  if (!existing && !apiKey) return back("Informe a chave de API do Asaas.");
  if (apiKey && (apiKey.length < 20 || /\s/.test(apiKey))) return back("Chave de API inválida.");

  const num = (k: string) => Number(String(formData.get(k) ?? "0").replace(",", "."));
  const iss = num("issPercent");
  if (!Number.isFinite(iss) || iss < 0 || iss > 10) return back("A alíquota de ISS deve estar entre 0 e 10%.");
  const fiscal = {
    municipalServiceName: String(formData.get("municipalServiceName") ?? "").trim().slice(0, 200) || DEFAULT_FISCAL.municipalServiceName,
    municipalServiceCode: String(formData.get("municipalServiceCode") ?? "").trim().slice(0, 40),
    municipalServiceId: String(formData.get("municipalServiceId") ?? "").trim().slice(0, 60),
    issPercent: iss,
    retainIss: formData.get("retainIss") === "on",
    descriptionTemplate: String(formData.get("descriptionTemplate") ?? "").trim().slice(0, 500) || DEFAULT_FISCAL.descriptionTemplate,
  };

  if (existing) {
    await db.paymentAccount.update({
      where: { id: existing.id },
      data: { environment: env, fiscal, ...(apiKey ? { apiKeyEnc: encryptField(apiKey) } : {}) },
    });
  } else {
    await db.paymentAccount.create({
      data: { clinicId: user.clinicId, environment: env, apiKeyEnc: encryptField(apiKey), webhookToken: encryptField(randomBytes(32).toString("hex")), fiscal },
    });
  }
  await audit({ clinicId: user.clinicId, userId: user.id, action: "GATEWAY_CONFIGURADO", entity: "PaymentAccount", entityId: existing?.id ?? null });
  back(undefined, "Configuração salva.");
}

export async function testGatewayAction() {
  const user = await requireRole("ADMIN");
  const ctx = await loadAsaas(user.clinicId);
  if (!ctx) return back("Salve a configuração antes de testar.");
  const r = await asaas(ctx, "GET", "/customers?limit=1");
  if (!r.ok) return back(r.error);
  back(undefined, `Conexão com o Asaas OK (${ctx.env === "PRODUCTION" ? "produção" : "sandbox"}).`);
}

// Cadastra o webhook no Asaas (pagamentos e notas fiscais) apontando para este sistema.
export async function registerWebhookAction() {
  const user = await requireRole("ADMIN");
  const ctx = await loadAsaas(user.clinicId);
  if (!ctx) return back("Salve a configuração antes.");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const clinic = await db.clinic.findUniqueOrThrow({ where: { id: user.clinicId }, select: { email: true } });

  const r = await asaas(ctx, "POST", "/webhooks", {
    name: "Sistema de Clínicas",
    url: `${proto}://${host}/api/webhooks/asaas/${ctx.accountId}`,
    email: clinic.email ?? user.email,
    enabled: true,
    interrupted: false,
    apiVersion: 3,
    authToken: ctx.webhookToken,
    sendType: "SEQUENTIALLY",
    events: [
      "PAYMENT_CREATED",
      "PAYMENT_RECEIVED",
      "PAYMENT_CONFIRMED",
      "PAYMENT_OVERDUE",
      "PAYMENT_DELETED",
      "PAYMENT_REFUNDED",
      "INVOICE_CREATED",
      "INVOICE_UPDATED",
      "INVOICE_SYNCHRONIZED",
      "INVOICE_AUTHORIZED",
      "INVOICE_PROCESSING_CANCELLATION",
      "INVOICE_CANCELED",
      "INVOICE_CANCELLATION_DENIED",
      "INVOICE_ERROR",
    ],
  });
  if (!r.ok) return back(r.error);
  await audit({ clinicId: user.clinicId, userId: user.id, action: "GATEWAY_WEBHOOK_CADASTRADO", entity: "PaymentAccount", entityId: ctx.accountId });
  back(undefined, "Webhook cadastrado no Asaas. Pagamentos e notas passam a ser atualizados automaticamente.");
}

// ---- Pix ----

export async function createPixAction(formData: FormData) {
  const user = await requireRole("ADMIN", "FINANCEIRO", "RECEPCAO");
  const chargeId = String(formData.get("id") ?? "");
  const c = await db.charge.findFirst({ where: { id: chargeId, clinicId: user.clinicId }, select: { id: true, patientId: true, competence: true } });
  if (!c) redirect("/financeiro");
  const fail = (m: string): never => redirect(`/financeiro?mes=${c.competence ?? ""}&erro=${encodeURIComponent(m)}`);

  const ctx = await loadAsaas(user.clinicId);
  if (!ctx) return fail("Configure o gateway em Configurações → Pagamentos e nota fiscal.");
  const r = await createPixForCharge(ctx, c.id, await patientCpf(user.clinicId, c.patientId));
  if (!r.ok) return fail(r.error);
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PIX_GERADO", entity: "Charge", entityId: c.id });
  revalidatePath("/financeiro");
  redirect(`/financeiro/${c.id}/pix`);
}

// ---- Nota fiscal de serviço ----

export async function issueInvoiceAction(formData: FormData) {
  const user = await requireRole("ADMIN", "FINANCEIRO");
  const chargeId = String(formData.get("id") ?? "");
  const c = await db.charge.findFirst({ where: { id: chargeId, clinicId: user.clinicId }, select: { id: true, patientId: true, competence: true } });
  if (!c) redirect("/financeiro");
  const fail = (m: string): never => redirect(`/financeiro?mes=${c.competence ?? ""}&erro=${encodeURIComponent(m)}`);

  const ctx = await loadAsaas(user.clinicId);
  if (!ctx) return fail("Configure o gateway e os dados fiscais em Configurações → Pagamentos e nota fiscal.");
  const r = await issueInvoiceForCharge(ctx, c.id, await patientCpf(user.clinicId, c.patientId));
  if (!r.ok) return fail(r.error);
  await audit({ clinicId: user.clinicId, userId: user.id, action: "NFSE_SOLICITADA", entity: "Invoice", entityId: r.data });
  revalidatePath("/financeiro");
  redirect(`/financeiro?mes=${c.competence ?? ""}&ok=${encodeURIComponent("Nota de serviço solicitada. O status é atualizado automaticamente.")}`);
}

// Consulta o status da nota no gateway (caso o webhook ainda não tenha chegado).
export async function refreshInvoiceAction(formData: FormData) {
  const user = await requireRole("ADMIN", "FINANCEIRO");
  const inv = await db.invoice.findFirst({ where: { id: String(formData.get("id") ?? ""), clinicId: user.clinicId }, include: { charge: { select: { competence: true } } } });
  if (!inv?.externalId) redirect("/financeiro");
  const mes = inv.charge.competence ?? "";
  const ctx = await loadAsaas(user.clinicId);
  if (!ctx) redirect(`/financeiro?mes=${mes}`);
  const r = await asaas<{ status?: string; number?: string | number; pdfUrl?: string; xmlUrl?: string; statusDescription?: string }>(ctx, "GET", `/invoices/${inv.externalId}`);
  if (!r.ok) redirect(`/financeiro?mes=${mes}&erro=${encodeURIComponent(r.error)}`);
  const status = mapInvoiceStatus(r.data.status);
  await db.invoice.update({
    where: { id: inv.id },
    data: {
      status,
      ...(r.data.number ? { number: String(r.data.number) } : {}),
      ...(r.data.pdfUrl ? { pdfUrl: r.data.pdfUrl } : {}),
      ...(r.data.xmlUrl ? { xmlUrl: r.data.xmlUrl } : {}),
      errorMessage: status === "ERRO" ? (r.data.statusDescription ?? "A prefeitura recusou a nota. Verifique os dados fiscais.") : null,
    },
  });
  redirect(`/financeiro?mes=${mes}`);
}
