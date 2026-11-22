import { db } from "./db";
import { decryptField } from "./crypto";
import { baseUrl, buildInvoicePayload, centsToReais, readFiscal, renderDescription, type AsaasEnv } from "./asaas-core";
import { localDate } from "./agenda";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export type AsaasCtx = { clinicId: string; accountId: string; env: AsaasEnv; apiKey: string; webhookToken: string; fiscal: ReturnType<typeof readFiscal> };

export async function loadAsaas(clinicId: string): Promise<AsaasCtx | null> {
  const acc = await db.paymentAccount.findUnique({ where: { clinicId } });
  if (!acc || acc.status !== "ATIVA") return null;
  return {
    clinicId,
    accountId: acc.id,
    env: acc.environment === "PRODUCTION" ? "PRODUCTION" : "SANDBOX",
    apiKey: decryptField(acc.apiKeyEnc),
    webhookToken: decryptField(acc.webhookToken),
    fiscal: readFiscal(acc.fiscal),
  };
}

// Chamada à API v3 do Asaas. Erros viram mensagem em português (sem expor a chave).
export async function asaas<T>(ctx: Pick<AsaasCtx, "env" | "apiKey">, method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<Result<T>> {
  try {
    const res = await fetch(`${baseUrl(ctx.env)}${path}`, {
      method,
      headers: {
        access_token: ctx.apiKey,
        "Content-Type": "application/json",
        "User-Agent": "sistema-clinicas",
      },
      body: body === undefined || method === "GET" ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json().catch(() => ({}))) as { errors?: { code?: string; description?: string }[] };
    if (!res.ok) {
      if (res.status === 401) return { ok: false, error: "Chave de API inválida ou do ambiente errado (sandbox x produção)." };
      const msg = json.errors?.map((e) => e.description).filter(Boolean).join(" · ");
      return { ok: false, error: msg || `Erro ${res.status} do Asaas.` };
    }
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, error: "Não foi possível falar com o Asaas. Tente novamente." };
  }
}

// Garante o cliente no gateway (reaproveita o id já salvo no paciente).
export async function ensureCustomer(ctx: AsaasCtx, patientId: string, cpf: string | null): Promise<Result<string>> {
  const p = await db.patient.findFirst({ where: { id: patientId, clinicId: ctx.clinicId }, select: { fullName: true, email: true, phoneE164: true, gatewayCustomerId: true } });
  if (!p) return { ok: false, error: "Paciente não encontrado." };
  if (p.gatewayCustomerId) return { ok: true, data: p.gatewayCustomerId };
  if (!cpf) return { ok: false, error: "Cadastre o CPF do paciente para gerar cobrança no gateway." };

  const r = await asaas<{ id: string }>(ctx, "POST", "/customers", {
    name: p.fullName,
    cpfCnpj: cpf,
    ...(p.email ? { email: p.email } : {}),
    ...(p.phoneE164 ? { mobilePhone: p.phoneE164.replace(/^\+55/, "") } : {}),
    externalReference: patientId,
    notificationDisabled: true, // quem avisa o paciente é a clínica, não o gateway
  });
  if (!r.ok) return r;
  await db.patient.update({ where: { id: patientId }, data: { gatewayCustomerId: r.data.id } });
  return { ok: true, data: r.data.id };
}

// Cria a cobrança Pix no gateway e guarda QR Code e copia-e-cola na cobrança local.
export async function createPixForCharge(ctx: AsaasCtx, chargeId: string, cpf: string | null): Promise<Result<true>> {
  const c = await db.charge.findFirst({ where: { id: chargeId, clinicId: ctx.clinicId }, include: { patient: { select: { id: true, fullName: true } } } });
  if (!c) return { ok: false, error: "Cobrança não encontrada." };
  if (c.status !== "PENDENTE") return { ok: false, error: "Só cobranças pendentes podem gerar Pix." };
  if (c.gatewayId && c.pixPayload) return { ok: true, data: true };

  const cust = await ensureCustomer(ctx, c.patientId, cpf);
  if (!cust.ok) return cust;

  let gatewayId = c.gatewayId;
  let gatewayUrl = c.gatewayUrl;
  if (!gatewayId) {
    const today = localDate(new Date());
    const due = c.dueDate.toISOString().slice(0, 10);
    const pay = await asaas<{ id: string; invoiceUrl?: string }>(ctx, "POST", "/payments", {
      customer: cust.data,
      billingType: "PIX",
      value: centsToReais(c.amountCents),
      dueDate: due < today ? today : due,
      description: `Atendimento — ${c.patient.fullName}`.slice(0, 500),
      externalReference: c.id,
    });
    if (!pay.ok) return pay;
    gatewayId = pay.data.id;
    gatewayUrl = pay.data.invoiceUrl ?? null;
    await db.charge.update({ where: { id: c.id }, data: { gatewayId, gatewayUrl } });
  }

  const qr = await asaas<{ encodedImage: string; payload: string; expirationDate?: string }>(ctx, "GET", `/payments/${gatewayId}/pixQrCode`);
  if (!qr.ok) return qr;
  const exp = qr.data.expirationDate ? new Date(`${qr.data.expirationDate.replace(" ", "T")}-03:00`) : null;
  await db.charge.update({
    where: { id: c.id },
    data: { pixPayload: qr.data.payload, pixQrImage: qr.data.encodedImage, pixExpiresAt: exp && !Number.isNaN(exp.getTime()) ? exp : null },
  });
  return { ok: true, data: true };
}

// Agenda e autoriza a NFS-e (nota de serviço) de uma cobrança paga.
export async function issueInvoiceForCharge(ctx: AsaasCtx, chargeId: string, cpf: string | null): Promise<Result<string>> {
  const c = await db.charge.findFirst({
    where: { id: chargeId, clinicId: ctx.clinicId },
    include: { patient: { select: { id: true, fullName: true } }, invoices: { where: { status: { in: ["AGENDADA", "EMITIDA", "CANCELANDO"] } } }, appointment: { select: { startsAt: true } } },
  });
  if (!c) return { ok: false, error: "Cobrança não encontrada." };
  if (c.status !== "PAGA") return { ok: false, error: "A nota de serviço só pode ser emitida para cobrança paga." };
  if (c.invoices.length > 0) return { ok: false, error: "Esta cobrança já tem uma nota emitida ou em processamento." };

  const cust = await ensureCustomer(ctx, c.patientId, cpf);
  if (!cust.ok) return cust;

  const serviceDate = localDate(c.appointment?.startsAt ?? c.paidAt ?? c.dueDate).split("-").reverse().join("/");
  const description = renderDescription(ctx.fiscal.descriptionTemplate, { data: serviceDate, paciente: c.patient.fullName });
  const payload = buildInvoicePayload({
    paymentId: c.gatewayId,
    customerId: cust.data,
    valueCents: c.amountCents,
    description,
    effectiveDate: localDate(new Date()),
    fiscal: ctx.fiscal,
    externalReference: c.id,
  });

  const created = await asaas<{ id: string; status?: string }>(ctx, "POST", "/invoices", payload);
  if (!created.ok) return created;

  const inv = await db.invoice.create({
    data: { clinicId: ctx.clinicId, chargeId: c.id, patientId: c.patientId, externalId: created.data.id, status: "AGENDADA", valueCents: c.amountCents, serviceDescription: description },
  });
  // Pede a emissão agora (sem aguardar a data de competência). O resultado final chega por webhook.
  await asaas(ctx, "POST", `/invoices/${created.data.id}/authorize`);
  return { ok: true, data: inv.id };
}
