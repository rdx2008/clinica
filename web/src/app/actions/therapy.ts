"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { encryptField } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { canAccessPatient, requireClinician } from "@/lib/clinical";

const GOAL_STATUS = ["EM_ANDAMENTO", "ALCANCADA", "PAUSADA", "ABANDONADA"];

function back(patientId: string, msg?: string): never {
  redirect(`/pacientes/${patientId}/plano${msg ? `?erro=${encodeURIComponent(msg)}` : ""}`);
}

function dateOnly(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createPlanAction(formData: FormData) {
  const { user, professionalId } = await requireClinician();
  const patientId = String(formData.get("patientId") ?? "");
  if (!(await canAccessPatient(user.clinicId, professionalId, patientId))) redirect("/pacientes");
  const focus = String(formData.get("focus") ?? "").trim();
  if (focus.length < 5 || focus.length > 3000) return back(patientId, "Descreva o foco do plano (5 a 3000 caracteres).");
  const existing = await db.therapyPlan.findFirst({ where: { clinicId: user.clinicId, patientId, professionalId, status: "ATIVO" }, select: { id: true } });
  if (existing) return back(patientId, "Já existe um plano ativo. Conclua-o antes de criar outro.");

  const p = await db.therapyPlan.create({ data: { clinicId: user.clinicId, patientId, professionalId, focusEnc: encryptField(focus) } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PLANO_CRIADO", entity: "TherapyPlan", entityId: p.id });
  back(patientId);
}

async function ownPlan(clinicId: string, professionalId: string, planId: string) {
  return db.therapyPlan.findFirst({ where: { id: planId, clinicId, professionalId } });
}

export async function addGoalAction(formData: FormData) {
  const { user, professionalId } = await requireClinician();
  const plan = await ownPlan(user.clinicId, professionalId, String(formData.get("planId") ?? ""));
  if (!plan) redirect("/pacientes");
  if (plan.status !== "ATIVO") return back(plan.patientId, "O plano está concluído.");
  const text = String(formData.get("text") ?? "").trim();
  if (text.length < 3 || text.length > 1000) return back(plan.patientId, "Descreva a meta (3 a 1000 caracteres).");
  const target = String(formData.get("targetDate") ?? "");
  const g = await db.therapyGoal.create({ data: { planId: plan.id, textEnc: encryptField(text), targetDate: target ? dateOnly(target) : null } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "META_CRIADA", entity: "TherapyGoal", entityId: g.id });
  back(plan.patientId);
}

export async function updateGoalAction(formData: FormData) {
  const { user, professionalId } = await requireClinician();
  const goal = await db.therapyGoal.findUnique({ where: { id: String(formData.get("goalId") ?? "") }, include: { plan: true } });
  if (!goal || goal.plan.clinicId !== user.clinicId || goal.plan.professionalId !== professionalId) redirect("/pacientes");
  const status = String(formData.get("status") ?? "");
  const progress = Number(formData.get("progress"));
  if (!GOAL_STATUS.includes(status) || !Number.isInteger(progress) || progress < 0 || progress > 100) return back(goal.plan.patientId, "Dados da meta inválidos.");
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000);
  await db.therapyGoal.update({
    where: { id: goal.id },
    data: { status, progress: status === "ALCANCADA" ? 100 : progress, ...(note ? { noteEnc: encryptField(note) } : {}) },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "META_ATUALIZADA", entity: "TherapyGoal", entityId: goal.id });
  back(goal.plan.patientId);
}

export async function concludePlanAction(formData: FormData) {
  const { user, professionalId } = await requireClinician();
  const plan = await ownPlan(user.clinicId, professionalId, String(formData.get("planId") ?? ""));
  if (!plan) redirect("/pacientes");
  await db.therapyPlan.update({ where: { id: plan.id }, data: { status: "CONCLUIDO" } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PLANO_CONCLUIDO", entity: "TherapyPlan", entityId: plan.id });
  back(plan.patientId);
}
