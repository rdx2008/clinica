"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";
import { parseBRL, validMonth } from "@/lib/money";
import { payoutFigures } from "@/lib/payout";
import { localDate } from "@/lib/agenda";

const ROLES = ["ADMIN", "FINANCEIRO", "RECEPCAO"] as const;
const METHODS = ["PIX", "DINHEIRO", "CARTAO", "TRANSFERENCIA", "OUTRO"];

function dateOnly(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---- Despesas ----

const expenseSchema = z.object({
  description: z.string().trim().min(2, "Descreva a despesa").max(120),
  category: z.string().trim().min(2).max(60),
  amount: z.string(),
  date: z.string(),
});

export async function createExpenseAction(formData: FormData) {
  const user = await requireRole("ADMIN", "FINANCEIRO");
  const back = (m: string, mes?: string): never => redirect(`/financeiro/despesas?${mes ? `mes=${mes}&` : ""}erro=${encodeURIComponent(m)}`);
  const parsed = expenseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return back(parsed.error.issues[0].message);
  const cents = parseBRL(parsed.data.amount);
  if (!cents || cents <= 0) return back("Valor inválido.");
  const date = dateOnly(parsed.data.date);
  if (!date) return back("Data inválida.");
  const paid = formData.get("paid") === "on";
  const e = await db.expense.create({
    data: { clinicId: user.clinicId, description: parsed.data.description, category: parsed.data.category, amountCents: cents, date, paidAt: paid ? new Date() : null },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "DESPESA_CRIADA", entity: "Expense", entityId: e.id });
  revalidatePath("/financeiro/despesas");
  redirect(`/financeiro/despesas?mes=${parsed.data.date.slice(0, 7)}`);
}

export async function toggleExpensePaidAction(formData: FormData) {
  const user = await requireRole("ADMIN", "FINANCEIRO");
  const id = String(formData.get("id") ?? "");
  const e = await db.expense.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!e) redirect("/financeiro/despesas");
  await db.expense.update({ where: { id }, data: { paidAt: e.paidAt ? null : new Date() } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: e.paidAt ? "DESPESA_REABERTA" : "DESPESA_PAGA", entity: "Expense", entityId: id });
  redirect(`/financeiro/despesas?mes=${e.date.toISOString().slice(0, 7)}`);
}

export async function deleteExpenseAction(formData: FormData) {
  const user = await requireRole("ADMIN", "FINANCEIRO");
  const id = String(formData.get("id") ?? "");
  const e = await db.expense.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!e) redirect("/financeiro/despesas");
  await db.expense.delete({ where: { id } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "DESPESA_REMOVIDA", entity: "Expense", entityId: id });
  redirect(`/financeiro/despesas?mes=${e.date.toISOString().slice(0, 7)}`);
}

// ---- Pacotes de sessões ----

const packageSchema = z.object({
  patientId: z.string().min(1, "Selecione o paciente"),
  serviceId: z.string().min(1, "Selecione o serviço"),
  sessions: z.coerce.number().int().min(2, "Mínimo de 2 sessões").max(100),
  price: z.string(),
  method: z.string().optional(),
});

export async function createPackageAction(formData: FormData) {
  const user = await requireRole(...ROLES);
  const back = (m: string): never => redirect(`/financeiro/pacotes?erro=${encodeURIComponent(m)}`);
  const parsed = packageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return back(parsed.error.issues[0].message);
  const cents = parseBRL(parsed.data.price);
  if (!cents || cents <= 0) return back("Valor inválido.");

  const [patient, service] = await Promise.all([
    db.patient.findFirst({ where: { id: parsed.data.patientId, clinicId: user.clinicId, status: "ATIVO" }, select: { id: true } }),
    db.service.findFirst({ where: { id: parsed.data.serviceId, clinicId: user.clinicId }, select: { id: true } }),
  ]);
  if (!patient) return back("Paciente não encontrado ou inativo.");
  if (!service) return back("Serviço não encontrado.");

  const today = localDate(new Date());
  const paidNow = formData.get("paidNow") === "on";
  const method = METHODS.includes(String(parsed.data.method)) ? String(parsed.data.method) : "PIX";

  const pkg = await db.$transaction(async (tx) => {
    const p = await tx.package.create({
      data: { clinicId: user.clinicId, patientId: patient.id, serviceId: service.id, sessionsTotal: parsed.data.sessions, priceCents: cents },
    });
    // O pacote gera uma cobrança única (receita do pacote).
    await tx.charge.create({
      data: {
        clinicId: user.clinicId,
        patientId: patient.id,
        amountCents: cents,
        dueDate: new Date(`${today}T00:00:00.000Z`),
        competence: today.slice(0, 7),
        ...(paidNow ? { status: "PAGA" as const, method, paidAt: new Date() } : {}),
      },
    });
    return p;
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PACOTE_CRIADO", entity: "Package", entityId: pkg.id });
  revalidatePath("/financeiro/pacotes");
  redirect("/financeiro/pacotes");
}

// ---- Repasses a profissionais ----

export async function setSharePercentAction(formData: FormData) {
  const user = await requireRole("ADMIN", "FINANCEIRO");
  const id = String(formData.get("id") ?? "");
  const mes = String(formData.get("mes") ?? "");
  const pct = Number(formData.get("percent"));
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) redirect(`/financeiro/repasses?mes=${mes}&erro=${encodeURIComponent("Percentual deve ser de 0 a 100.")}`);
  await db.professional.updateMany({ where: { id, clinicId: user.clinicId }, data: { sharePercent: pct } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "REPASSE_PERCENTUAL", entity: "Professional", entityId: id });
  redirect(`/financeiro/repasses?mes=${mes}`);
}

// Fecha o repasse do mês (grava o valor calculado no momento). Reabrir exige apagar o fechamento.
export async function closePayoutAction(formData: FormData) {
  const user = await requireRole("ADMIN", "FINANCEIRO");
  const professionalId = String(formData.get("professionalId") ?? "");
  const mes = String(formData.get("mes") ?? "");
  if (!validMonth(mes)) redirect("/financeiro/repasses");
  const prof = await db.professional.findFirst({ where: { id: professionalId, clinicId: user.clinicId } });
  if (!prof) redirect("/financeiro/repasses");

  const fig = (await payoutFigures(user.clinicId, [{ id: prof.id, sharePercent: prof.sharePercent }], mes)).get(prof.id);
  try {
    await db.payout.create({
      data: { clinicId: user.clinicId, professionalId, period: mes, grossCents: fig?.grossCents ?? 0, shareCents: fig?.shareCents ?? 0 },
    });
  } catch {
    redirect(`/financeiro/repasses?mes=${mes}&erro=${encodeURIComponent("Esse repasse já foi fechado.")}`);
  }
  await audit({ clinicId: user.clinicId, userId: user.id, action: "REPASSE_FECHADO", entity: "Payout", entityId: professionalId });
  redirect(`/financeiro/repasses?mes=${mes}`);
}

export async function payPayoutAction(formData: FormData) {
  const user = await requireRole("ADMIN", "FINANCEIRO");
  const id = String(formData.get("id") ?? "");
  const p = await db.payout.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!p) redirect("/financeiro/repasses");
  await db.payout.update({ where: { id }, data: { status: "PAGO", paidAt: new Date() } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "REPASSE_PAGO", entity: "Payout", entityId: id });
  redirect(`/financeiro/repasses?mes=${p.period}`);
}

// ---- Estorno (reabrir cobrança paga) ----

export async function reopenChargeAction(formData: FormData) {
  const user = await requireRole("ADMIN", "FINANCEIRO");
  const id = String(formData.get("id") ?? "");
  const c = await db.charge.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!c) redirect("/financeiro");
  if (c.status === "PAGA") {
    await db.charge.update({ where: { id }, data: { status: "PENDENTE", paidAt: null, method: null } });
    await audit({ clinicId: user.clinicId, userId: user.id, action: "COBRANCA_ESTORNADA", entity: "Charge", entityId: id });
  }
  redirect(`/financeiro?mes=${c.competence ?? ""}`);
}
