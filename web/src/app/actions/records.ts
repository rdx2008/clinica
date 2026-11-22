"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { RecordType } from "@prisma/client";
import { db } from "@/lib/db";
import { encryptField } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { canAccessPatient, MAX_RECORD_CHARS, RECORD_TYPES, requireClinician } from "@/lib/clinical";

const schema = z.object({
  patientId: z.string().min(1),
  type: z.string().refine((t) => RECORD_TYPES.includes(t), "Tipo inválido"),
  content: z.string().trim().min(1, "Escreva o conteúdo do registro").max(MAX_RECORD_CHARS, `Máximo de ${MAX_RECORD_CHARS} caracteres`),
  appointmentId: z.string().optional(),
});

function fail(path: string, msg: string): never {
  redirect(`${path}?erro=${encodeURIComponent(msg)}`);
}

export async function createRecordAction(formData: FormData) {
  const { user, professionalId } = await requireClinician();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  const patientId = String(formData.get("patientId") ?? "");
  const base = `/pacientes/${patientId}/prontuario/novo`;
  if (!parsed.success) fail(base, parsed.error.issues[0].message);
  const d = parsed.data;
  if (!(await canAccessPatient(user.clinicId, professionalId, d.patientId))) redirect("/pacientes");

  let appointmentId: string | null = null;
  if (d.appointmentId) {
    const a = await db.appointment.findFirst({ where: { id: d.appointmentId, clinicId: user.clinicId, patientId: d.patientId, professionalId }, select: { id: true } });
    if (!a) fail(base, "Atendimento não encontrado.");
    appointmentId = a.id;
  }

  const rec = await db.clinicalRecord.create({
    data: {
      clinicId: user.clinicId,
      patientId: d.patientId,
      professionalId,
      appointmentId,
      type: d.type as RecordType,
      contentEnc: encryptField(d.content),
    },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PRONTUARIO_CRIADO", entity: "ClinicalRecord", entityId: rec.id });
  revalidatePath(`/pacientes/${d.patientId}/prontuario`);
  redirect(`/pacientes/${d.patientId}/prontuario/${rec.id}`);
}

async function ownRecord(clinicId: string, professionalId: string, id: string) {
  return db.clinicalRecord.findFirst({ where: { id, clinicId, professionalId } });
}

// Rascunho editável; cada salvamento guarda a versão anterior. Aprovado é imutável.
export async function updateRecordAction(formData: FormData) {
  const { user, professionalId } = await requireClinician();
  const id = String(formData.get("id") ?? "");
  const rec = await ownRecord(user.clinicId, professionalId, id);
  if (!rec) redirect("/pacientes");
  const path = `/pacientes/${rec.patientId}/prontuario/${rec.id}`;
  if (rec.status === "APROVADO") fail(path, "Registro aprovado não pode ser editado. Crie um novo registro para complementar.");

  const parsed = schema.shape.content.safeParse(formData.get("content"));
  if (!parsed.success) fail(path, parsed.error.issues[0].message);

  await db.$transaction([
    db.clinicalRecordVersion.create({ data: { recordId: rec.id, contentEnc: rec.contentEnc, authorId: user.id } }),
    db.clinicalRecord.update({ where: { id: rec.id }, data: { contentEnc: encryptField(parsed.data), version: { increment: 1 } } }),
  ]);
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PRONTUARIO_EDITADO", entity: "ClinicalRecord", entityId: rec.id });
  redirect(path);
}

export async function approveRecordAction(formData: FormData) {
  const { user, professionalId } = await requireClinician();
  const id = String(formData.get("id") ?? "");
  const rec = await ownRecord(user.clinicId, professionalId, id);
  if (!rec) redirect("/pacientes");
  if (rec.status !== "APROVADO") {
    await db.clinicalRecord.update({ where: { id }, data: { status: "APROVADO", approvedAt: new Date() } });
    await audit({ clinicId: user.clinicId, userId: user.id, action: "PRONTUARIO_APROVADO", entity: "ClinicalRecord", entityId: id });
  }
  redirect(`/pacientes/${rec.patientId}/prontuario/${rec.id}`);
}

// Só rascunhos podem ser descartados; registro aprovado deve ser preservado (guarda obrigatória).
export async function deleteDraftAction(formData: FormData) {
  const { user, professionalId } = await requireClinician();
  const id = String(formData.get("id") ?? "");
  const rec = await ownRecord(user.clinicId, professionalId, id);
  if (!rec) redirect("/pacientes");
  if (rec.status === "APROVADO") fail(`/pacientes/${rec.patientId}/prontuario/${rec.id}`, "Registro aprovado não pode ser excluído.");
  await db.$transaction([
    db.clinicalRecordVersion.deleteMany({ where: { recordId: id } }),
    db.clinicalRecord.delete({ where: { id } }),
  ]);
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PRONTUARIO_RASCUNHO_EXCLUIDO", entity: "ClinicalRecord", entityId: id });
  redirect(`/pacientes/${rec.patientId}/prontuario`);
}

// ---- Modelos de registro do profissional ----

const templateSchema = z.object({
  name: z.string().trim().min(3, "Dê um nome ao modelo").max(80),
  type: z.string().refine((t) => RECORD_TYPES.includes(t), "Tipo inválido"),
  content: z.string().trim().min(10, "Escreva o texto do modelo").max(MAX_RECORD_CHARS),
});

export async function createTemplateAction(formData: FormData) {
  const { user, professionalId } = await requireClinician();
  const parsed = templateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) fail("/prontuario/modelos", parsed.error.issues[0].message);
  const t = await db.recordTemplate.create({
    data: { clinicId: user.clinicId, professionalId, name: parsed.data.name, type: parsed.data.type as RecordType, content: parsed.data.content },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "MODELO_PRONTUARIO_CRIADO", entity: "RecordTemplate", entityId: t.id });
  redirect("/prontuario/modelos");
}

export async function deleteTemplateAction(formData: FormData) {
  const { user, professionalId } = await requireClinician();
  const id = String(formData.get("id") ?? "");
  const r = await db.recordTemplate.deleteMany({ where: { id, clinicId: user.clinicId, professionalId } });
  if (r.count) await audit({ clinicId: user.clinicId, userId: user.id, action: "MODELO_PRONTUARIO_REMOVIDO", entity: "RecordTemplate", entityId: id });
  redirect("/prontuario/modelos");
}

// ---- Compartilhamento de um registro com outro profissional (com finalidade e prazo) ----

const GRANT_DAYS = [7, 30, 90, 180];

export async function grantAccessAction(formData: FormData) {
  const { user, professionalId } = await requireClinician();
  const recordId = String(formData.get("recordId") ?? "");
  const rec = await ownRecord(user.clinicId, professionalId, recordId);
  if (!rec) redirect("/pacientes");
  const path = `/pacientes/${rec.patientId}/prontuario/${rec.id}`;

  if (rec.type === "ANOTACAO_PESSOAL") fail(path, "Anotações pessoais não podem ser compartilhadas.");
  const granteeId = String(formData.get("granteeId") ?? "");
  const purpose = String(formData.get("purpose") ?? "").trim();
  const days = Number(formData.get("days"));
  if (purpose.length < 5) fail(path, "Informe a finalidade do compartilhamento (mínimo 5 caracteres).");
  if (!GRANT_DAYS.includes(days)) fail(path, "Prazo inválido.");
  if (granteeId === professionalId) fail(path, "Selecione outro profissional.");
  const grantee = await db.professional.findFirst({ where: { id: granteeId, clinicId: user.clinicId, user: { active: true } }, select: { id: true } });
  if (!grantee) fail(path, "Profissional não encontrado.");

  const g = await db.clinicalAccessGrant.create({
    data: { recordId, granteeId, purpose: purpose.slice(0, 200), grantedBy: user.id, expiresAt: new Date(Date.now() + days * 86400_000) },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PRONTUARIO_COMPARTILHADO", entity: "ClinicalRecord", entityId: rec.id });
  void g;
  redirect(path);
}

export async function revokeGrantAction(formData: FormData) {
  const { user, professionalId } = await requireClinician();
  const grantId = String(formData.get("grantId") ?? "");
  const grant = await db.clinicalAccessGrant.findUnique({ where: { id: grantId }, include: { record: true } });
  if (!grant || grant.record.clinicId !== user.clinicId || grant.record.professionalId !== professionalId) redirect("/pacientes");
  await db.clinicalAccessGrant.delete({ where: { id: grantId } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PRONTUARIO_COMPARTILHAMENTO_REVOGADO", entity: "ClinicalRecord", entityId: grant.recordId });
  redirect(`/pacientes/${grant.record.patientId}/prontuario/${grant.recordId}`);
}

// ---- Anexos: remover (somente em rascunho do próprio autor) ----

export async function deleteAttachmentAction(formData: FormData) {
  const { user, professionalId } = await requireClinician();
  const id = String(formData.get("id") ?? "");
  const att = await db.clinicalAttachment.findUnique({ where: { id }, include: { record: true } });
  if (!att || att.record.clinicId !== user.clinicId || att.record.professionalId !== professionalId) redirect("/pacientes");
  const path = `/pacientes/${att.record.patientId}/prontuario/${att.record.id}`;
  if (att.record.status === "APROVADO") fail(path, "Registro aprovado não permite remover anexos.");
  await db.clinicalAttachment.delete({ where: { id } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "ANEXO_REMOVIDO", entity: "ClinicalRecord", entityId: att.record.id });
  redirect(path);
}
