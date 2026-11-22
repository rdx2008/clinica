"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { encryptField } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { canAccessPatient, requireClinician } from "@/lib/clinical";
import { isScaleKey, scoreScale, SCALES } from "@/lib/scales";
import { getPortalSession, patientsForEmail } from "@/lib/portal";

function readAnswers(formData: FormData, n: number): number[] | null {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = formData.get(`a${i}`);
    if (v === null || v === "") return null;
    out.push(Number(v));
  }
  return out;
}

// ---- Profissional: enviar pelo portal ----

export async function assignScaleAction(formData: FormData) {
  const { user, professionalId } = await requireClinician();
  const patientId = String(formData.get("patientId") ?? "");
  const key = String(formData.get("scaleKey") ?? "");
  const back = (m?: string): never => redirect(`/pacientes/${patientId}/escalas${m ? `?erro=${encodeURIComponent(m)}` : ""}`);
  if (!isScaleKey(key)) return back("Escala inválida.");
  if (!(await canAccessPatient(user.clinicId, professionalId, patientId))) redirect("/pacientes");

  const pending = await db.scaleAssignment.findFirst({ where: { patientId, professionalId, scaleKey: key, status: "PENDENTE" }, select: { id: true } });
  if (pending) return back("Já existe um envio pendente dessa escala para o paciente.");
  const a = await db.scaleAssignment.create({ data: { clinicId: user.clinicId, patientId, professionalId, scaleKey: key, source: "PORTAL" } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "ESCALA_ENVIADA", entity: "ScaleAssignment", entityId: a.id });
  back();
}

export async function cancelScaleAction(formData: FormData) {
  const { user, professionalId } = await requireClinician();
  const id = String(formData.get("id") ?? "");
  const a = await db.scaleAssignment.findFirst({ where: { id, clinicId: user.clinicId, professionalId, status: "PENDENTE" } });
  if (!a) redirect("/pacientes");
  await db.scaleAssignment.update({ where: { id }, data: { status: "CANCELADA" } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "ESCALA_CANCELADA", entity: "ScaleAssignment", entityId: id });
  redirect(`/pacientes/${a.patientId}/escalas`);
}

// ---- Profissional: aplicar durante a sessão ----

export async function applyScaleInSessionAction(formData: FormData) {
  const { user, professionalId } = await requireClinician();
  const patientId = String(formData.get("patientId") ?? "");
  const key = String(formData.get("scaleKey") ?? "");
  const back = (m: string): never => redirect(`/pacientes/${patientId}/escalas/aplicar?escala=${key}&erro=${encodeURIComponent(m)}`);
  if (!isScaleKey(key)) redirect(`/pacientes/${patientId}/escalas`);
  if (!(await canAccessPatient(user.clinicId, professionalId, patientId))) redirect("/pacientes");

  const answers = readAnswers(formData, SCALES[key].items.length);
  const result = answers ? scoreScale(key, answers) : null;
  if (!answers || !result) return back("Responda todos os itens.");

  const a = await db.scaleAssignment.create({
    data: {
      clinicId: user.clinicId,
      patientId,
      professionalId,
      scaleKey: key,
      source: "SESSAO",
      status: "RESPONDIDA",
      dataEnc: encryptField(JSON.stringify({ answers, score: result.score, severity: result.severity })),
      riskFlag: result.risk,
      answeredAt: new Date(),
      seenAt: new Date(),
    },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "ESCALA_APLICADA_SESSAO", entity: "ScaleAssignment", entityId: a.id });
  redirect(`/pacientes/${patientId}/escalas`);
}

// ---- Profissional: ciente do alerta de risco ----

export async function ackRiskAction(formData: FormData) {
  const { user, professionalId } = await requireClinician();
  const id = String(formData.get("id") ?? "");
  const a = await db.scaleAssignment.findFirst({ where: { id, clinicId: user.clinicId, professionalId } });
  if (!a) redirect("/pacientes");
  await db.scaleAssignment.update({ where: { id }, data: { riskAckAt: new Date(), seenAt: a.seenAt ?? new Date() } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "ESCALA_RISCO_CIENTE", entity: "ScaleAssignment", entityId: id });
  redirect(`/pacientes/${a.patientId}/escalas`);
}

// ---- Paciente (portal): responder ----

export async function submitScalePortalAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const id = String(formData.get("id") ?? "");
  const s = await getPortalSession(slug);
  if (!s) redirect(`/p/${slug}`);
  const patients = await patientsForEmail(s.clinic.id, s.email);

  const a = await db.scaleAssignment.findFirst({ where: { id, clinicId: s.clinic.id, patientId: { in: patients.map((p) => p.id) }, status: "PENDENTE" } });
  if (!a || !isScaleKey(a.scaleKey)) redirect(`/p/${slug}/inicio`);
  const key = a.scaleKey;

  const answers = readAnswers(formData, SCALES[key].items.length);
  const result = answers ? scoreScale(key, answers) : null;
  if (!answers || !result) redirect(`/p/${slug}/questionario/${id}?erro=${encodeURIComponent("Responda todos os itens.")}`);

  await db.scaleAssignment.update({
    where: { id },
    data: {
      status: "RESPONDIDA",
      dataEnc: encryptField(JSON.stringify({ answers, score: result.score, severity: result.severity })),
      riskFlag: result.risk,
      answeredAt: new Date(),
    },
  });
  await db.auditLog.create({ data: { clinicId: s.clinic.id, action: result.risk ? "ESCALA_RESPONDIDA_PORTAL_RISCO" : "ESCALA_RESPONDIDA_PORTAL", entity: "ScaleAssignment", entityId: id } });
  // O paciente nunca vê pontuação nem faixa: quem interpreta é o profissional.
  redirect(`/p/${slug}/questionario/${id}?feito=${result.risk ? "risco" : "1"}`);
}
