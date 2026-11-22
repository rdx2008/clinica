import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { requireRole } from "./session";

export const RECORD_TYPE_LABEL: Record<string, string> = {
  ANAMNESE: "Anamnese",
  DEMANDA: "Demanda / queixa",
  EVOLUCAO: "Evolução da sessão",
  ENCAMINHAMENTO: "Encaminhamento",
  ENCERRAMENTO: "Encerramento",
  DOCUMENTO: "Documento",
  ANOTACAO_PESSOAL: "Anotação pessoal",
};

export const RECORD_TYPES = Object.keys(RECORD_TYPE_LABEL);
export const MAX_RECORD_CHARS = 20000;

// Prontuário é sigiloso: só o profissional responsável acessa. Administração, recepção e
// financeiro nunca leem o conteúdo clínico (princípio do mínimo necessário, LGPD).
export async function requireClinician() {
  const user = await requireRole("PROFISSIONAL");
  const professional = await db.professional.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!professional) throw new Error("Usuário sem perfil de profissional.");
  return { user, professionalId: professional.id };
}

// Quais pacientes cada perfil enxerga. Administração e recepção veem todos; o profissional vê
// só os que atende (ou atendeu), os que já têm registro dele e os que ele mesmo cadastrou.
// Use dentro de `AND: [patientScope(user)]` em consultas de Patient.
export function patientScope(user: { id: string; role: string }): Prisma.PatientWhereInput {
  if (user.role !== "PROFISSIONAL") return {};
  return {
    OR: [
      { createdByUserId: user.id },
      { appointments: { some: { status: { not: "CANCELADA" }, professional: { userId: user.id } } } },
      { records: { some: { professional: { userId: user.id } } } },
    ],
  };
}

// O profissional pode abrir o paciente se atende (ou atendeu), já registrou algo nele ou o cadastrou.
export async function canAccessPatient(clinicId: string, professionalId: string, patientId: string): Promise<boolean> {
  const patient = await db.patient.findFirst({ where: { id: patientId, clinicId }, select: { id: true, createdByUserId: true } });
  if (!patient) return false;
  const [appt, rec, prof] = await Promise.all([
    db.appointment.findFirst({ where: { clinicId, patientId, professionalId, status: { not: "CANCELADA" } }, select: { id: true } }),
    db.clinicalRecord.findFirst({ where: { clinicId, patientId, professionalId }, select: { id: true } }),
    patient.createdByUserId ? db.professional.findUnique({ where: { id: professionalId }, select: { userId: true } }) : null,
  ]);
  return !!(appt || rec || (prof && prof.userId === patient.createdByUserId));
}
