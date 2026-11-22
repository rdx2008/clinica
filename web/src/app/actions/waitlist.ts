"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";

function back(msg?: string): never {
  redirect(`/agenda/espera${msg ? `?erro=${encodeURIComponent(msg)}` : ""}`);
}

export async function addWaitlistAction(formData: FormData) {
  const user = await requireRole("ADMIN", "RECEPCAO");
  const patient = await db.patient.findFirst({
    where: { id: String(formData.get("patientId") ?? ""), clinicId: user.clinicId, status: "ATIVO" },
    select: { id: true },
  });
  if (!patient) back("Selecione um paciente ativo.");

  const professionalId = String(formData.get("professionalId") ?? "") || null;
  if (professionalId) {
    const p = await db.professional.findFirst({ where: { id: professionalId, clinicId: user.clinicId }, select: { id: true } });
    if (!p) back("Profissional não encontrado.");
  }
  const serviceId = String(formData.get("serviceId") ?? "") || null;
  if (serviceId) {
    const s = await db.service.findFirst({ where: { id: serviceId, clinicId: user.clinicId }, select: { id: true } });
    if (!s) back("Serviço não encontrado.");
  }
  const dup = await db.waitlistEntry.findFirst({ where: { clinicId: user.clinicId, patientId: patient.id, status: "ABERTA" }, select: { id: true } });
  if (dup) back("Esse paciente já está na lista de espera.");

  const entry = await db.waitlistEntry.create({
    data: {
      clinicId: user.clinicId,
      patientId: patient.id,
      professionalId,
      serviceId,
      preference: String(formData.get("preference") ?? "").trim().slice(0, 200) || null,
      notes: String(formData.get("notes") ?? "").trim().slice(0, 300) || null,
    },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "ESPERA_ADICIONADO", entity: "WaitlistEntry", entityId: entry.id });
  back();
}

export async function setWaitlistStatusAction(formData: FormData) {
  const user = await requireRole("ADMIN", "RECEPCAO");
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!["ATENDIDA", "REMOVIDA", "ABERTA"].includes(status)) back("Status inválido.");
  const r = await db.waitlistEntry.updateMany({ where: { id, clinicId: user.clinicId }, data: { status } });
  if (r.count) await audit({ clinicId: user.clinicId, userId: user.id, action: `ESPERA_${status}`, entity: "WaitlistEntry", entityId: id });
  back();
}
