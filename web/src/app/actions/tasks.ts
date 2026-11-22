"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { encryptField } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { canAccessPatient, requireClinician } from "@/lib/clinical";
import { getPortalSession, patientsForEmail } from "@/lib/portal";

function dateOrNull(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---- Profissional ----

export async function createTaskAction(formData: FormData) {
  const { user, professionalId } = await requireClinician();
  const patientId = String(formData.get("patientId") ?? "");
  const back = (m?: string): never => redirect(`/pacientes/${patientId}/tarefas${m ? `?erro=${encodeURIComponent(m)}` : ""}`);
  if (!(await canAccessPatient(user.clinicId, professionalId, patientId))) redirect("/pacientes");

  const title = String(formData.get("title") ?? "").trim();
  const text = String(formData.get("text") ?? "").trim();
  const rawDue = String(formData.get("dueDate") ?? "");
  if (title.length < 3 || title.length > 120) return back("Dê um título de 3 a 120 caracteres.");
  if (text.length > 2000) return back("As instruções podem ter até 2000 caracteres.");
  const due = rawDue ? dateOrNull(rawDue) : null;
  if (rawDue && !due) return back("Data inválida.");

  const patient = await db.patient.findFirst({ where: { id: patientId, clinicId: user.clinicId }, select: { email: true } });
  if (!patient?.email) return back("O paciente precisa ter e-mail cadastrado para receber tarefas pelo portal.");

  const t = await db.patientTask.create({
    data: {
      clinicId: user.clinicId,
      patientId,
      professionalId,
      titleEnc: encryptField(title),
      textEnc: text ? encryptField(text) : null,
      dueDate: due,
    },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "TAREFA_CRIADA", entity: "PatientTask", entityId: t.id });
  back();
}

export async function cancelTaskAction(formData: FormData) {
  const { user, professionalId } = await requireClinician();
  const id = String(formData.get("id") ?? "");
  const t = await db.patientTask.findFirst({ where: { id, clinicId: user.clinicId, professionalId, status: "PENDENTE" } });
  if (!t) redirect("/pacientes");
  await db.patientTask.update({ where: { id }, data: { status: "CANCELADA" } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "TAREFA_CANCELADA", entity: "PatientTask", entityId: id });
  redirect(`/pacientes/${t.patientId}/tarefas`);
}

// ---- Paciente (portal) ----

export async function completeTaskPortalAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("id") ?? "");
  const s = await getPortalSession(slug);
  if (!s) redirect(`/p/${slug}`);
  const patients = await patientsForEmail(s.clinic.id, s.email);

  const t = await db.patientTask.findFirst({ where: { id, clinicId: s.clinic.id, patientId: { in: patients.map((p) => p.id) }, status: "PENDENTE" } });
  if (!t) redirect(`/p/${slug}/inicio`);
  const response = String(formData.get("response") ?? "").trim();
  if (response.length > 3000) redirect(`/p/${slug}/tarefa/${id}?erro=${encodeURIComponent("O retorno pode ter até 3000 caracteres.")}`);

  await db.patientTask.update({
    where: { id },
    data: { status: "FEITA", doneAt: new Date(), responseEnc: response ? encryptField(response) : null },
  });
  await db.auditLog.create({ data: { clinicId: s.clinic.id, action: "TAREFA_CONCLUIDA_PORTAL", entity: "PatientTask", entityId: id } });
  redirect(`/p/${slug}/tarefa/${id}`);
}
