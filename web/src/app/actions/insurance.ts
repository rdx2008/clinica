"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";
import { encryptField } from "@/lib/crypto";
import { onlyDigits } from "@/lib/br";
import { localDate } from "@/lib/agenda";
import { parseBRL, validMonth } from "@/lib/money";

const FIN = ["ADMIN", "FINANCEIRO"] as const;
const FRONT = ["ADMIN", "RECEPCAO"] as const;

function dateOrNull(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---- Convênios e tabela de valores (admin e financeiro) ----

const insurerSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do convênio").max(80),
  cnpj: z.string().trim().optional(),
  paymentDays: z.coerce.number().int().min(0, "Prazo inválido").max(365, "Prazo máximo de 365 dias"),
  sharePercent: z.string().trim().optional(),
});

function parseShare(raw: string | undefined): number | null | "invalid" {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : "invalid";
}

export async function createInsurerAction(formData: FormData) {
  const user = await requireRole(...FIN);
  const back = (m: string): never => redirect(`/financeiro/convenios?erro=${encodeURIComponent(m)}`);
  const parsed = insurerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return back(parsed.error.issues[0].message);
  const d = parsed.data;
  const cnpj = d.cnpj ? onlyDigits(d.cnpj) : null;
  if (cnpj && cnpj.length !== 14) return back("CNPJ deve ter 14 dígitos.");
  const share = parseShare(d.sharePercent);
  if (share === "invalid") return back("Repasse deve ser de 0 a 100.");
  const dup = await db.insurer.findFirst({ where: { clinicId: user.clinicId, name: { equals: d.name, mode: "insensitive" } }, select: { id: true } });
  if (dup) return back("Já existe um convênio com esse nome.");
  const i = await db.insurer.create({ data: { clinicId: user.clinicId, name: d.name, cnpj, paymentDays: d.paymentDays, sharePercent: share } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CONVENIO_CRIADO", entity: "Insurer", entityId: i.id });
  redirect(`/financeiro/convenios/${i.id}`);
}

export async function updateInsurerAction(formData: FormData) {
  const user = await requireRole(...FIN);
  const id = String(formData.get("id") ?? "");
  const back = (m: string): never => redirect(`/financeiro/convenios/${id}?erro=${encodeURIComponent(m)}`);
  const parsed = insurerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return back(parsed.error.issues[0].message);
  const d = parsed.data;
  const cnpj = d.cnpj ? onlyDigits(d.cnpj) : null;
  if (cnpj && cnpj.length !== 14) return back("CNPJ deve ter 14 dígitos.");
  const share = parseShare(d.sharePercent);
  if (share === "invalid") return back("Repasse deve ser de 0 a 100.");
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 500) || null;
  const r = await db.insurer.updateMany({
    where: { id, clinicId: user.clinicId },
    data: { name: d.name, cnpj, paymentDays: d.paymentDays, sharePercent: share, notes, active: formData.get("active") === "on" },
  });
  if (r.count === 0) redirect("/financeiro/convenios");
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CONVENIO_ALTERADO", entity: "Insurer", entityId: id });
  revalidatePath("/financeiro/convenios");
  redirect(`/financeiro/convenios/${id}?ok=${encodeURIComponent("Convênio salvo.")}`);
}

// Valor que o convênio paga por serviço; vazio remove o valor (o serviço deixa de poder ser agendado por ele).
export async function setInsurerPriceAction(formData: FormData) {
  const user = await requireRole(...FIN);
  const insurerId = String(formData.get("insurerId") ?? "");
  const serviceId = String(formData.get("serviceId") ?? "");
  const back = (m: string): never => redirect(`/financeiro/convenios/${insurerId}?erro=${encodeURIComponent(m)}`);
  const [insurer, service] = await Promise.all([
    db.insurer.findFirst({ where: { id: insurerId, clinicId: user.clinicId }, select: { id: true } }),
    db.service.findFirst({ where: { id: serviceId, clinicId: user.clinicId }, select: { id: true } }),
  ]);
  if (!insurer || !service) redirect("/financeiro/convenios");
  const raw = String(formData.get("price") ?? "").trim();
  if (!raw) {
    await db.insurerPrice.deleteMany({ where: { insurerId, serviceId } });
  } else {
    const cents = parseBRL(raw);
    if (cents === null || cents <= 0) return back("Valor inválido.");
    const tuss = String(formData.get("tuss") ?? "").trim();
    if (tuss && !/^[0-9A-Za-z.\-]{1,20}$/.test(tuss)) return back("Código TUSS inválido.");
    await db.insurerPrice.upsert({
      where: { insurerId_serviceId: { insurerId, serviceId } },
      create: { insurerId, serviceId, priceCents: cents, tussCode: tuss || null },
      update: { priceCents: cents, tussCode: tuss || null },
    });
  }
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CONVENIO_VALOR_ALTERADO", entity: "Insurer", entityId: insurerId });
  redirect(`/financeiro/convenios/${insurerId}`);
}

// ---- Carteirinha e autorização do paciente (admin e recepção) ----

const cardSchema = z.object({
  patientId: z.string().min(1),
  insurerId: z.string().min(1, "Selecione o convênio"),
  card: z.string().trim().min(3, "Informe o número da carteirinha").max(40),
  planName: z.string().trim().max(60).optional(),
  validUntil: z.string().optional(),
});

export async function addPatientInsuranceAction(formData: FormData) {
  const user = await requireRole(...FRONT);
  const patientId = String(formData.get("patientId") ?? "");
  const back = (m: string): never => redirect(`/pacientes/${patientId}/convenios?erro=${encodeURIComponent(m)}`);
  const parsed = cardSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return back(parsed.error.issues[0].message);
  const d = parsed.data;
  const [patient, insurer] = await Promise.all([
    db.patient.findFirst({ where: { id: d.patientId, clinicId: user.clinicId }, select: { id: true } }),
    db.insurer.findFirst({ where: { id: d.insurerId, clinicId: user.clinicId, active: true }, select: { id: true } }),
  ]);
  if (!patient) redirect("/pacientes");
  if (!insurer) return back("Convênio não encontrado ou inativo.");
  const validUntil = d.validUntil ? dateOrNull(d.validUntil) : null;
  if (d.validUntil && !validUntil) return back("Validade inválida.");
  const row = await db.patientInsurance.create({
    data: { clinicId: user.clinicId, patientId, insurerId: insurer.id, planName: d.planName || null, cardEnc: encryptField(d.card), validUntil },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CARTEIRINHA_CRIADA", entity: "PatientInsurance", entityId: row.id });
  redirect(`/pacientes/${patientId}/convenios`);
}

export async function togglePatientInsuranceAction(formData: FormData) {
  const user = await requireRole(...FRONT);
  const id = String(formData.get("id") ?? "");
  const row = await db.patientInsurance.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!row) redirect("/pacientes");
  await db.patientInsurance.update({ where: { id }, data: { active: !row.active } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: row.active ? "CARTEIRINHA_INATIVADA" : "CARTEIRINHA_REATIVADA", entity: "PatientInsurance", entityId: id });
  redirect(`/pacientes/${row.patientId}/convenios`);
}

const authSchema = z.object({
  patientInsuranceId: z.string().min(1),
  code: z.string().trim().min(1, "Informe o código da autorização").max(40),
  sessions: z.coerce.number().int().min(1, "Informe as sessões autorizadas").max(200),
  validUntil: z.string().optional(),
});

export async function addAuthorizationAction(formData: FormData) {
  const user = await requireRole(...FRONT);
  const row = await db.patientInsurance.findFirst({ where: { id: String(formData.get("patientInsuranceId") ?? ""), clinicId: user.clinicId } });
  if (!row) redirect("/pacientes");
  const back = (m: string): never => redirect(`/pacientes/${row.patientId}/convenios?erro=${encodeURIComponent(m)}`);
  const parsed = authSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return back(parsed.error.issues[0].message);
  const d = parsed.data;
  const validUntil = d.validUntil ? dateOrNull(d.validUntil) : null;
  if (d.validUntil && !validUntil) return back("Validade inválida.");
  const a = await db.insuranceAuth.create({
    data: { clinicId: user.clinicId, patientInsuranceId: row.id, code: d.code, sessionsTotal: d.sessions, validUntil },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "AUTORIZACAO_CRIADA", entity: "InsuranceAuth", entityId: a.id });
  redirect(`/pacientes/${row.patientId}/convenios`);
}

// ---- Recebimento do convênio (admin e financeiro) ----

function paymentDate(raw: string): Date {
  return dateOrNull(raw) ?? new Date(`${localDate(new Date())}T00:00:00.000Z`);
}

export async function markEntryPaidAction(formData: FormData) {
  const user = await requireRole(...FIN);
  const id = String(formData.get("id") ?? "");
  const e = await db.insuranceEntry.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!e) redirect("/financeiro/convenios");
  if (e.status === "A_FATURAR" || e.status === "FATURADO") {
    const paidAt = paymentDate(String(formData.get("date") ?? ""));
    await db.insuranceEntry.update({ where: { id }, data: { status: "PAGO", paidAt, paymentMonth: paidAt.toISOString().slice(0, 7) } });
    await audit({ clinicId: user.clinicId, userId: user.id, action: "CONVENIO_RECEBIDO", entity: "InsuranceEntry", entityId: id });
  }
  revalidatePath("/financeiro/convenios");
  redirect(`/financeiro/convenios/${e.insurerId}?mes=${e.competence}`);
}

// Recebimento do convênio de uma competência inteira (o pagamento do lote costuma vir de uma vez).
export async function markCompetencePaidAction(formData: FormData) {
  const user = await requireRole(...FIN);
  const insurerId = String(formData.get("insurerId") ?? "");
  const mes = String(formData.get("mes") ?? "");
  if (!validMonth(mes)) redirect("/financeiro/convenios");
  const insurer = await db.insurer.findFirst({ where: { id: insurerId, clinicId: user.clinicId }, select: { id: true } });
  if (!insurer) redirect("/financeiro/convenios");
  const paidAt = paymentDate(String(formData.get("date") ?? ""));
  const r = await db.insuranceEntry.updateMany({
    where: { clinicId: user.clinicId, insurerId, competence: mes, status: { in: ["A_FATURAR", "FATURADO"] } },
    data: { status: "PAGO", paidAt, paymentMonth: paidAt.toISOString().slice(0, 7) },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CONVENIO_COMPETENCIA_RECEBIDA", entity: "Insurer", entityId: insurerId });
  redirect(`/financeiro/convenios/${insurerId}?mes=${mes}&ok=${encodeURIComponent(`${r.count} atendimento(s) marcado(s) como recebido(s).`)}`);
}

// Estorno do recebimento (volta para a receber). Repasse já fechado do mês de recebimento bloqueia.
export async function reopenEntryAction(formData: FormData) {
  const user = await requireRole(...FIN);
  const id = String(formData.get("id") ?? "");
  const e = await db.insuranceEntry.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!e) redirect("/financeiro/convenios");
  const back = (m: string): never => redirect(`/financeiro/convenios/${e.insurerId}?mes=${e.competence}&erro=${encodeURIComponent(m)}`);
  if (e.status !== "PAGO") return back("Só é possível estornar atendimentos recebidos.");
  if (e.paymentMonth) {
    const closed = await db.payout.findFirst({ where: { clinicId: user.clinicId, professionalId: e.professionalId, period: e.paymentMonth }, select: { id: true } });
    if (closed) return back("O repasse do mês do recebimento já foi fechado.");
  }
  await db.insuranceEntry.update({ where: { id }, data: { status: e.batchId ? "FATURADO" : "A_FATURAR", paidAt: null, paymentMonth: null } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CONVENIO_ESTORNADO", entity: "InsuranceEntry", entityId: id });
  redirect(`/financeiro/convenios/${e.insurerId}?mes=${e.competence}`);
}
