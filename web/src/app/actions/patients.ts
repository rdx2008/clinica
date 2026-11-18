"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { blindIndex, encryptField } from "@/lib/crypto";
import { isValidCpf, normalizeName, normalizePhoneBR, onlyDigits } from "@/lib/br";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";

export type PatientFormState = {
  error?: string;
  duplicates?: { id: string; fullName: string; reason: string }[];
};

const ALLOWED = ["ADMIN", "RECEPCAO", "PROFISSIONAL"] as const;
const CONSENT_VERSION = "v1";

const patientSchema = z.object({
  fullName: z.string().trim().min(3, "Informe o nome completo"),
  birthDate: z.string().optional(),
  cpf: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().trim().toLowerCase().email("E-mail inválido").or(z.literal("")).optional(),
  source: z.string().trim().optional(),
  tags: z.string().optional(),
});

function parseCommon(formData: FormData) {
  const parsed = patientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message } as const;
  const d = parsed.data;

  let birthDate: Date | null = null;
  if (d.birthDate) {
    birthDate = new Date(`${d.birthDate}T00:00:00.000Z`);
    if (Number.isNaN(birthDate.getTime()) || birthDate > new Date()) return { error: "Data de nascimento inválida" } as const;
  }
  const cpfDigits = d.cpf ? onlyDigits(d.cpf) : "";
  if (cpfDigits && !isValidCpf(cpfDigits)) return { error: "CPF inválido" } as const;
  let phone: string | null = null;
  if (d.phone?.trim()) {
    phone = normalizePhoneBR(d.phone);
    if (!phone) return { error: "Telefone inválido. Use DDD + número." } as const;
  }
  const tags = (d.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 10);

  return { value: { fullName: d.fullName, birthDate, cpfDigits, phone, email: d.email || null, source: d.source || null, tags } } as const;
}

// Procura possíveis duplicados na mesma clínica: mesmo CPF, mesmo telefone ou mesmo nome + nascimento.
async function findDuplicates(
  clinicId: string,
  v: { fullName: string; birthDate: Date | null; cpfDigits: string; phone: string | null },
  excludeId?: string,
) {
  const out = new Map<string, { id: string; fullName: string; reason: string }>();
  const base = { clinicId, ...(excludeId ? { id: { not: excludeId } } : {}) };

  if (v.cpfDigits) {
    for (const p of await db.patient.findMany({ where: { ...base, dedupeKey: blindIndex(v.cpfDigits) }, select: { id: true, fullName: true } })) {
      out.set(p.id, { ...p, reason: "mesmo CPF" });
    }
  }
  if (v.phone) {
    for (const p of await db.patient.findMany({ where: { ...base, phoneE164: v.phone }, select: { id: true, fullName: true } })) {
      if (!out.has(p.id)) out.set(p.id, { ...p, reason: "mesmo telefone" });
    }
  }
  if (v.birthDate) {
    const same = await db.patient.findMany({ where: { ...base, birthDate: v.birthDate }, select: { id: true, fullName: true } });
    for (const p of same) {
      if (!out.has(p.id) && normalizeName(p.fullName) === normalizeName(v.fullName)) out.set(p.id, { ...p, reason: "mesmo nome e nascimento" });
    }
  }
  return [...out.values()];
}

export async function createPatientAction(_prev: PatientFormState, formData: FormData): Promise<PatientFormState> {
  const user = await requireRole(...ALLOWED);
  const parsed = parseCommon(formData);
  if ("error" in parsed) return { error: parsed.error };
  const v = parsed.value;

  if (formData.get("dataConsent") !== "on") return { error: "Registre o consentimento para tratamento de dados do paciente." };

  if (formData.get("confirmDuplicate") !== "on") {
    const duplicates = await findDuplicates(user.clinicId, v);
    if (duplicates.length) {
      return { error: "Já existem cadastros parecidos. Confira antes de criar outro.", duplicates };
    }
  }

  const patient = await db.patient.create({
    data: {
      clinicId: user.clinicId,
      fullName: v.fullName,
      birthDate: v.birthDate,
      cpfEnc: v.cpfDigits ? encryptField(v.cpfDigits) : null,
      dedupeKey: v.cpfDigits ? blindIndex(v.cpfDigits) : null,
      phoneE164: v.phone,
      email: v.email,
      source: v.source,
      tags: v.tags,
      consents: {
        create: [
          { type: "TRATAMENTO_DADOS", version: CONSENT_VERSION, channel: "PRESENCIAL" },
          ...(formData.get("whatsappOptin") === "on" && v.phone
            ? [{ type: "WHATSAPP_OPTIN", version: CONSENT_VERSION, channel: "PRESENCIAL" }]
            : []),
        ],
      },
    },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PACIENTE_CRIADO", entity: "Patient", entityId: patient.id });
  revalidatePath("/pacientes");
  redirect(`/pacientes/${patient.id}`);
}

export async function updatePatientAction(_prev: PatientFormState, formData: FormData): Promise<PatientFormState> {
  const user = await requireRole(...ALLOWED);
  const id = String(formData.get("id") ?? "");
  const current = await db.patient.findFirst({ where: { id, clinicId: user.clinicId }, select: { id: true } });
  if (!current) return { error: "Paciente não encontrado." };

  const parsed = parseCommon(formData);
  if ("error" in parsed) return { error: parsed.error };
  const v = parsed.value;

  if (formData.get("confirmDuplicate") !== "on") {
    const duplicates = await findDuplicates(user.clinicId, v, id);
    if (duplicates.length) return { error: "Existem outros cadastros parecidos. Confira antes de salvar.", duplicates };
  }

  await db.patient.update({
    where: { id },
    data: {
      fullName: v.fullName,
      birthDate: v.birthDate,
      phoneE164: v.phone,
      email: v.email,
      source: v.source,
      tags: v.tags,
      // CPF só muda se um novo for informado (o atual nunca volta para o formulário).
      ...(v.cpfDigits ? { cpfEnc: encryptField(v.cpfDigits), dedupeKey: blindIndex(v.cpfDigits) } : {}),
    },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PACIENTE_ALTERADO", entity: "Patient", entityId: id });
  revalidatePath(`/pacientes/${id}`);
  redirect(`/pacientes/${id}`);
}

function backTo(id: string, msg?: string): never {
  redirect(`/pacientes/${id}${msg ? `?erro=${encodeURIComponent(msg)}` : ""}`);
}

async function ownedPatient(userClinicId: string, formData: FormData) {
  const id = String(formData.get("patientId") ?? "");
  const p = await db.patient.findFirst({ where: { id, clinicId: userClinicId }, select: { id: true, phoneE164: true } });
  if (!p) redirect("/pacientes");
  return p;
}

export async function addGuardianAction(formData: FormData) {
  const user = await requireRole(...ALLOWED);
  const p = await ownedPatient(user.clinicId, formData);
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) backTo(p.id, "Informe o nome do responsável.");
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const phone = phoneRaw ? normalizePhoneBR(phoneRaw) : null;
  if (phoneRaw && !phone) backTo(p.id, "Telefone do responsável inválido.");
  await db.guardian.create({
    data: {
      patientId: p.id,
      name,
      relation: String(formData.get("relation") ?? "").trim() || null,
      phone,
      isLegalGuardian: formData.get("legal") === "on",
    },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "RESPONSAVEL_ADICIONADO", entity: "Patient", entityId: p.id });
  backTo(p.id);
}

export async function removeGuardianAction(formData: FormData) {
  const user = await requireRole(...ALLOWED);
  const p = await ownedPatient(user.clinicId, formData);
  await db.guardian.deleteMany({ where: { id: String(formData.get("id") ?? ""), patientId: p.id } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "RESPONSAVEL_REMOVIDO", entity: "Patient", entityId: p.id });
  backTo(p.id);
}

export async function addContactAction(formData: FormData) {
  const user = await requireRole(...ALLOWED);
  const p = await ownedPatient(user.clinicId, formData);
  const name = String(formData.get("name") ?? "").trim();
  const phone = normalizePhoneBR(String(formData.get("phone") ?? ""));
  if (name.length < 2) backTo(p.id, "Informe o nome do contato autorizado.");
  if (!phone) backTo(p.id, "Telefone do contato inválido.");
  await db.authorizedContact.create({
    data: { patientId: p.id, name, phone, scope: String(formData.get("scope") ?? "agenda") },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CONTATO_AUTORIZADO_ADICIONADO", entity: "Patient", entityId: p.id });
  backTo(p.id);
}

export async function removeContactAction(formData: FormData) {
  const user = await requireRole(...ALLOWED);
  const p = await ownedPatient(user.clinicId, formData);
  await db.authorizedContact.deleteMany({ where: { id: String(formData.get("id") ?? ""), patientId: p.id } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "CONTATO_AUTORIZADO_REMOVIDO", entity: "Patient", entityId: p.id });
  backTo(p.id);
}

// Concede ou revoga o opt-in de WhatsApp (histórico preservado: revogação preenche revokedAt).
export async function setWhatsappOptinAction(formData: FormData) {
  const user = await requireRole(...ALLOWED);
  const p = await ownedPatient(user.clinicId, formData);
  const grant = formData.get("grant") === "true";
  if (grant) {
    if (!p.phoneE164) backTo(p.id, "Cadastre um telefone antes de registrar o opt-in.");
    await db.consent.create({ data: { patientId: p.id, type: "WHATSAPP_OPTIN", version: CONSENT_VERSION, channel: "PRESENCIAL" } });
  } else {
    await db.consent.updateMany({ where: { patientId: p.id, type: "WHATSAPP_OPTIN", revokedAt: null }, data: { revokedAt: new Date() } });
  }
  await audit({ clinicId: user.clinicId, userId: user.id, action: grant ? "OPTIN_WHATSAPP" : "OPTOUT_WHATSAPP", entity: "Patient", entityId: p.id });
  backTo(p.id);
}

export async function setPatientStatusAction(formData: FormData) {
  const user = await requireRole(...ALLOWED);
  const p = await ownedPatient(user.clinicId, formData);
  const status = formData.get("status") === "INATIVO" ? "INATIVO" : "ATIVO";
  await db.patient.update({ where: { id: p.id }, data: { status } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: `PACIENTE_${status}`, entity: "Patient", entityId: p.id });
  revalidatePath("/pacientes");
  backTo(p.id);
}
