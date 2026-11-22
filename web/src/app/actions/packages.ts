"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";
import { canAccessPatient, requireClinician } from "@/lib/clinical";
import { localDate } from "@/lib/agenda";
import { parseBRL } from "@/lib/money";

const FIN = ["ADMIN", "FINANCEIRO"] as const;
const SELL = ["ADMIN", "FINANCEIRO", "RECEPCAO"] as const;
const METHODS = ["PIX", "DINHEIRO", "CARTAO", "TRANSFERENCIA", "OUTRO"];

// ---- Catálogo (admin e financeiro) ----

const planSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do pacote").max(80),
  serviceId: z.string().min(1, "Selecione o serviço"),
  sessions: z.coerce.number().int().min(2, "Mínimo de 2 sessões").max(100, "Máximo de 100 sessões"),
  price: z.string(),
  validityDays: z.string().optional(),
});

export async function createPlanAction(formData: FormData) {
  const user = await requireRole(...FIN);
  const back = (m: string): never => redirect(`/financeiro/pacotes/modelos?erro=${encodeURIComponent(m)}`);
  const parsed = planSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return back(parsed.error.issues[0].message);
  const d = parsed.data;
  const cents = parseBRL(d.price);
  if (!cents || cents <= 0) return back("Valor inválido.");
  let validity: number | null = null;
  if (d.validityDays) {
    validity = Number(d.validityDays);
    if (!Number.isInteger(validity) || validity < 1 || validity > 1095) return back("Validade deve ser de 1 a 1095 dias.");
  }
  const service = await db.service.findFirst({ where: { id: d.serviceId, clinicId: user.clinicId }, select: { id: true } });
  if (!service) return back("Serviço não encontrado.");
  const p = await db.packagePlan.create({ data: { clinicId: user.clinicId, name: d.name, serviceId: service.id, sessions: d.sessions, priceCents: cents, validityDays: validity } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "MODELO_PACOTE_CRIADO", entity: "PackagePlan", entityId: p.id });
  redirect("/financeiro/pacotes/modelos");
}

export async function togglePlanAction(formData: FormData) {
  const user = await requireRole(...FIN);
  const id = String(formData.get("id") ?? "");
  const p = await db.packagePlan.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!p) redirect("/financeiro/pacotes/modelos");
  await db.packagePlan.update({ where: { id }, data: { active: !p.active } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: p.active ? "MODELO_PACOTE_INATIVADO" : "MODELO_PACOTE_REATIVADO", entity: "PackagePlan", entityId: id });
  redirect("/financeiro/pacotes/modelos");
}

// ---- Venda pelo catálogo (admin, financeiro e recepção): preço e sessões vêm do modelo ----

export async function sellPlanAction(formData: FormData) {
  const user = await requireRole(...SELL);
  const back = (m: string): never => redirect(`/financeiro/pacotes?erro=${encodeURIComponent(m)}`);
  const patientId = String(formData.get("patientId") ?? "");
  const planId = String(formData.get("planId") ?? "");
  const requestId = String(formData.get("requestId") ?? "");
  const [patient, plan] = await Promise.all([
    db.patient.findFirst({ where: { id: patientId, clinicId: user.clinicId, status: "ATIVO" }, select: { id: true } }),
    db.packagePlan.findFirst({ where: { id: planId, clinicId: user.clinicId, active: true } }),
  ]);
  if (!patient) return back("Paciente não encontrado ou inativo.");
  if (!plan) return back("Modelo de pacote não encontrado ou inativo.");

  const today = localDate(new Date());
  const paidNow = formData.get("paidNow") === "on";
  const method = METHODS.includes(String(formData.get("method"))) ? String(formData.get("method")) : "PIX";
  const validUntil = plan.validityDays ? new Date(new Date(`${today}T00:00:00.000Z`).getTime() + plan.validityDays * 86_400_000) : null;

  const pkg = await db.$transaction(async (tx) => {
    const p = await tx.package.create({
      data: { clinicId: user.clinicId, patientId: patient.id, serviceId: plan.serviceId, sessionsTotal: plan.sessions, priceCents: plan.priceCents, planId: plan.id, validUntil },
    });
    await tx.charge.create({
      data: {
        clinicId: user.clinicId,
        patientId: patient.id,
        amountCents: plan.priceCents,
        dueDate: new Date(`${today}T00:00:00.000Z`),
        competence: today.slice(0, 7),
        ...(paidNow ? { status: "PAGA" as const, method, paidAt: new Date() } : {}),
      },
    });
    if (requestId) {
      await tx.packageRequest.updateMany({ where: { id: requestId, clinicId: user.clinicId, status: "PENDENTE" }, data: { status: "ATENDIDA", resolvedBy: user.id, resolvedAt: new Date() } });
    }
    return p;
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PACOTE_VENDIDO", entity: "Package", entityId: pkg.id });
  revalidatePath("/financeiro/pacotes");
  redirect("/financeiro/pacotes");
}

// ---- Pedido do profissional ----

export async function requestPackageAction(formData: FormData) {
  const { user, professionalId } = await requireClinician();
  const patientId = String(formData.get("patientId") ?? "");
  const back = (m: string): never => redirect(`/pacientes/${patientId}/solicitar-pacote?erro=${encodeURIComponent(m)}`);
  if (!(await canAccessPatient(user.clinicId, professionalId, patientId))) redirect("/pacientes");
  const plan = await db.packagePlan.findFirst({ where: { id: String(formData.get("planId") ?? ""), clinicId: user.clinicId, active: true }, select: { id: true } });
  if (!plan) return back("Selecione um pacote do catálogo.");
  const dup = await db.packageRequest.findFirst({ where: { clinicId: user.clinicId, patientId, planId: plan.id, status: "PENDENTE" }, select: { id: true } });
  if (dup) return back("Já existe um pedido pendente deste pacote para o paciente.");
  const note = String(formData.get("note") ?? "").trim().slice(0, 300) || null;
  const r = await db.packageRequest.create({ data: { clinicId: user.clinicId, patientId, planId: plan.id, professionalId, note } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PACOTE_SOLICITADO", entity: "PackageRequest", entityId: r.id });
  redirect(`/pacientes/${patientId}/prontuario?ok=${encodeURIComponent("Pedido enviado à recepção/financeiro.")}`);
}

export async function declineRequestAction(formData: FormData) {
  const user = await requireRole(...SELL);
  const id = String(formData.get("id") ?? "");
  await db.packageRequest.updateMany({ where: { id, clinicId: user.clinicId, status: "PENDENTE" }, data: { status: "RECUSADA", resolvedBy: user.id, resolvedAt: new Date() } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PACOTE_PEDIDO_RECUSADO", entity: "PackageRequest", entityId: id });
  redirect("/financeiro/pacotes");
}
