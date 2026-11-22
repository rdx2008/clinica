"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";
import { parseBRL } from "@/lib/money";
import { localDate } from "@/lib/agenda";

const ROLES = ["ADMIN", "FINANCEIRO", "RECEPCAO"] as const;
const METHODS = ["PIX", "DINHEIRO", "CARTAO", "TRANSFERENCIA", "OUTRO"];

function dueFrom(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const d = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const schema = z.object({
  patientId: z.string().min(1, "Selecione o paciente"),
  amount: z.string(),
  due: z.string(),
});

export async function createChargeAction(formData: FormData) {
  const user = await requireRole(...ROLES);
  const back = (m: string): never => redirect(`/financeiro/nova?erro=${encodeURIComponent(m)}`);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return back(parsed.error.issues[0].message);
  const cents = parseBRL(parsed.data.amount);
  if (!cents || cents <= 0) return back("Valor inválido.");
  const due = dueFrom(parsed.data.due);
  if (!due) return back("Vencimento inválido.");
  const patient = await db.patient.findFirst({ where: { id: parsed.data.patientId, clinicId: user.clinicId }, select: { id: true } });
  if (!patient) return back("Paciente não encontrado.");

  const c = await db.charge.create({
    data: { clinicId: user.clinicId, patientId: patient.id, amountCents: cents, dueDate: due, competence: parsed.data.due.slice(0, 7) },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "COBRANCA_CRIADA", entity: "Charge", entityId: c.id });
  revalidatePath("/financeiro");
  redirect(`/financeiro?mes=${c.competence}`);
}

// Gera a cobrança de um atendimento com o valor do serviço (uma por atendimento).
export async function chargeFromAppointmentAction(formData: FormData) {
  const user = await requireRole(...ROLES);
  const id = String(formData.get("id") ?? "");
  const a = await db.appointment.findFirst({ where: { id, clinicId: user.clinicId }, include: { service: true } });
  if (!a) redirect("/agenda");
  const detail = (m: string): never => redirect(`/agenda/${id}?erro=${encodeURIComponent(m)}`);

  if (a.packageId) return detail("Este atendimento foi coberto por um pacote de sessões.");
  if (a.patientInsuranceId) return detail("Atendimento pelo convênio: o valor a receber é gerado ao marcar \"Compareceu\" (Financeiro → Convênios).");
  const existing = await db.charge.findFirst({ where: { appointmentId: id, status: { not: "CANCELADA" } }, select: { id: true } });
  if (existing) return detail("Este atendimento já tem uma cobrança.");
  if (a.service.priceCents <= 0) return detail("O serviço não tem valor definido.");

  const date = localDate(a.startsAt);
  const c = await db.charge.create({
    data: {
      clinicId: user.clinicId,
      patientId: a.patientId,
      appointmentId: a.id,
      amountCents: a.service.priceCents,
      dueDate: new Date(`${date}T00:00:00.000Z`),
      competence: date.slice(0, 7),
    },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "COBRANCA_CRIADA", entity: "Charge", entityId: c.id });
  redirect(`/financeiro?mes=${c.competence}`);
}

async function load(user: Awaited<ReturnType<typeof requireRole>>, id: string) {
  const c = await db.charge.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!c) redirect("/financeiro");
  return c;
}

export async function markPaidAction(formData: FormData) {
  const user = await requireRole(...ROLES);
  const c = await load(user, String(formData.get("id") ?? ""));
  const method = String(formData.get("method") ?? "");
  if (!METHODS.includes(method)) redirect(`/financeiro?mes=${c.competence}`);
  if (c.status === "PENDENTE") {
    await db.charge.update({ where: { id: c.id }, data: { status: "PAGA", method, paidAt: new Date() } });
    await audit({ clinicId: user.clinicId, userId: user.id, action: "COBRANCA_PAGA", entity: "Charge", entityId: c.id });
  }
  revalidatePath("/financeiro");
  redirect(`/financeiro?mes=${c.competence}`);
}

// Cobrança paga não é apagada nem cancelada: estorno exige tratamento próprio (fase seguinte).
export async function cancelChargeAction(formData: FormData) {
  const user = await requireRole(...ROLES);
  const c = await load(user, String(formData.get("id") ?? ""));
  if (c.status === "PENDENTE") {
    await db.charge.update({ where: { id: c.id }, data: { status: "CANCELADA" } });
    await audit({ clinicId: user.clinicId, userId: user.id, action: "COBRANCA_CANCELADA", entity: "Charge", entityId: c.id });
  }
  revalidatePath("/financeiro");
  redirect(`/financeiro?mes=${c.competence}`);
}
