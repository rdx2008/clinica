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

// O profissional pode abrir o prontuário se atende (ou atendeu) o paciente ou já registrou algo nele.
export async function canAccessPatient(clinicId: string, professionalId: string, patientId: string): Promise<boolean> {
  const patient = await db.patient.findFirst({ where: { id: patientId, clinicId }, select: { id: true } });
  if (!patient) return false;
  const [appt, rec] = await Promise.all([
    db.appointment.findFirst({ where: { clinicId, patientId, professionalId, status: { not: "CANCELADA" } }, select: { id: true } }),
    db.clinicalRecord.findFirst({ where: { clinicId, patientId, professionalId }, select: { id: true } }),
  ]);
  return !!(appt || rec);
}
