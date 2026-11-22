"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";
import { normalizePhoneBR, onlyDigits } from "@/lib/br";

function back(msg?: string, ok?: string): never {
  const q = msg ? `?erro=${encodeURIComponent(msg)}` : ok ? `?ok=${encodeURIComponent(ok)}` : "";
  redirect(`/configuracoes${q}`);
}

const clinicSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da clínica").max(120),
  cnpj: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().trim().toLowerCase().email("E-mail inválido").or(z.literal("")).optional(),
  address: z.string().trim().max(240).optional(),
});

export async function saveClinicAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const parsed = clinicSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) back(parsed.error.issues[0].message);
  const d = parsed.data;

  const cnpjDigits = onlyDigits(d.cnpj ?? "");
  if (cnpjDigits && cnpjDigits.length !== 14) back("CNPJ deve ter 14 dígitos.");
  let phone: string | null = null;
  if (d.phone?.trim()) {
    phone = normalizePhoneBR(d.phone);
    if (!phone) back("Telefone inválido. Use DDD + número.");
  }

  await db.clinic.update({
    where: { id: admin.clinicId },
    data: { name: d.name, cnpj: cnpjDigits || null, phone, email: d.email || null, address: d.address || null },
  });
  await audit({ clinicId: admin.clinicId, userId: admin.id, action: "CLINICA_ATUALIZADA", entity: "Clinic", entityId: admin.clinicId });
  back(undefined, "Dados da clínica salvos.");
}

export async function createRoomAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 60) back("Informe o nome da sala (2 a 60 caracteres).");
  const exists = await db.room.findFirst({ where: { clinicId: admin.clinicId, name: { equals: name, mode: "insensitive" } } });
  if (exists) back("Já existe uma sala com esse nome.");
  const r = await db.room.create({ data: { clinicId: admin.clinicId, name } });
  await audit({ clinicId: admin.clinicId, userId: admin.id, action: "SALA_CRIADA", entity: "Room", entityId: r.id });
  back(undefined, "Sala criada.");
}

export async function removeRoomAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  const room = await db.room.findFirst({ where: { id, clinicId: admin.clinicId } });
  if (!room) back("Sala não encontrada.");
  const used = await db.appointment.count({ where: { roomId: id } });
  if (used > 0) back("Essa sala já tem atendimentos e não pode ser removida.");
  await db.room.delete({ where: { id } });
  await audit({ clinicId: admin.clinicId, userId: admin.id, action: "SALA_REMOVIDA", entity: "Room", entityId: id });
  back(undefined, "Sala removida.");
}

export async function setProfessionalColorAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const id = String(formData.get("id") ?? "");
  const color = String(formData.get("color") ?? "");
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) back("Cor inválida.");
  await db.professional.updateMany({ where: { id, clinicId: admin.clinicId }, data: { color } });
  await audit({ clinicId: admin.clinicId, userId: admin.id, action: "PROFISSIONAL_COR", entity: "Professional", entityId: id });
  back(undefined, "Cor atualizada.");
}
