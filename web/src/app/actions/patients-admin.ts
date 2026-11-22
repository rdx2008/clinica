"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { blindIndex, encryptField } from "@/lib/crypto";
import { isValidCpf, normalizeName, normalizePhoneBR, onlyDigits } from "@/lib/br";
import { mapHeaders, parseCsv, parseDateFlexible } from "@/lib/csv";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";

export type ImportState = {
  error?: string;
  done?: boolean;
  created?: number;
  skipped?: { line: number; reason: string }[];
  errors?: { line: number; reason: string }[];
};

const MAX_ROWS = 2000;
const MAX_BYTES = 1_000_000;

// ---- Importação por planilha (CSV) ----

export async function importPatientsAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const user = await requireRole("ADMIN", "RECEPCAO");
  if (formData.get("consent") !== "on") return { error: "Confirme que a clínica possui o consentimento dos titulares para tratar esses dados." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecione um arquivo CSV." };
  if (file.size > MAX_BYTES) return { error: "Arquivo muito grande (máximo 1 MB)." };

  const { headers, rows } = parseCsv(await file.text());
  const map = mapHeaders(headers);
  if (map.nome === undefined) return { error: "A planilha precisa ter uma coluna \"Nome\". Colunas aceitas: nome, telefone, e-mail, nascimento, CPF, origem, etiquetas." };
  if (rows.length === 0) return { error: "A planilha não tem linhas de dados." };
  if (rows.length > MAX_ROWS) return { error: `Máximo de ${MAX_ROWS} linhas por importação.` };

  // Chaves de duplicidade já existentes na clínica.
  const existing = await db.patient.findMany({
    where: { clinicId: user.clinicId },
    select: { fullName: true, birthDate: true, phoneE164: true, dedupeKey: true },
  });
  const phones = new Set(existing.map((p) => p.phoneE164).filter((x): x is string => !!x));
  const cpfKeys = new Set(existing.map((p) => p.dedupeKey).filter((x): x is string => !!x));
  const nameBirth = new Set(existing.filter((p) => p.birthDate).map((p) => `${normalizeName(p.fullName)}|${p.birthDate!.toISOString().slice(0, 10)}`));

  const skipped: { line: number; reason: string }[] = [];
  const errors: { line: number; reason: string }[] = [];
  const toCreate: Parameters<typeof db.patient.create>[0]["data"][] = [];
  const get = (r: string[], k: keyof typeof map) => (map[k] === undefined ? "" : (r[map[k]!] ?? "").trim());

  rows.forEach((r, idx) => {
    const line = idx + 2; // linha na planilha (1 = cabeçalho)
    const name = get(r, "nome");
    if (name.length < 3) return errors.push({ line, reason: "Nome ausente ou muito curto" });

    const birthRaw = get(r, "nascimento");
    let birth: Date | null = null;
    if (birthRaw) {
      const iso = parseDateFlexible(birthRaw);
      if (!iso) return errors.push({ line, reason: `Data de nascimento inválida (${birthRaw})` });
      birth = new Date(`${iso}T00:00:00.000Z`);
      if (birth > new Date()) return errors.push({ line, reason: "Data de nascimento no futuro" });
    }
    const cpfRaw = get(r, "cpf");
    const cpf = onlyDigits(cpfRaw);
    if (cpfRaw && !isValidCpf(cpf)) return errors.push({ line, reason: `CPF inválido (${cpfRaw})` });
    const phoneRaw = get(r, "telefone");
    const phone = phoneRaw ? normalizePhoneBR(phoneRaw) : null;
    if (phoneRaw && !phone) return errors.push({ line, reason: `Telefone inválido (${phoneRaw})` });
    const email = get(r, "email").toLowerCase();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return errors.push({ line, reason: `E-mail inválido (${email})` });

    const cpfKey = cpf ? blindIndex(cpf) : null;
    const nbKey = birth ? `${normalizeName(name)}|${birth.toISOString().slice(0, 10)}` : null;
    if (cpfKey && cpfKeys.has(cpfKey)) return skipped.push({ line, reason: "CPF já cadastrado" });
    if (phone && phones.has(phone)) return skipped.push({ line, reason: "Telefone já cadastrado" });
    if (nbKey && nameBirth.has(nbKey)) return skipped.push({ line, reason: "Mesmo nome e nascimento já cadastrados" });
    if (cpfKey) cpfKeys.add(cpfKey);
    if (phone) phones.add(phone);
    if (nbKey) nameBirth.add(nbKey);

    toCreate.push({
      clinicId: user.clinicId,
      fullName: name,
      birthDate: birth,
      cpfEnc: cpf ? encryptField(cpf) : null,
      dedupeKey: cpfKey,
      phoneE164: phone,
      email: email || null,
      source: get(r, "origem") || "Importação",
      tags: get(r, "etiquetas").split(/[,;|]/).map((t) => t.trim()).filter(Boolean).slice(0, 10),
      consents: { create: [{ type: "TRATAMENTO_DADOS", version: "v1", channel: "IMPORTACAO" }] },
    });
  });

  for (let i = 0; i < toCreate.length; i += 25) {
    await Promise.all(toCreate.slice(i, i + 25).map((data) => db.patient.create({ data })));
  }
  await audit({ clinicId: user.clinicId, userId: user.id, action: `PACIENTES_IMPORTADOS_${toCreate.length}`, entity: "Patient" });
  revalidatePath("/pacientes");
  return { done: true, created: toCreate.length, skipped: skipped.slice(0, 50), errors: errors.slice(0, 50) };
}

// ---- Anonimização (direito do titular) ----

// Remove os dados identificáveis, mas preserva atendimentos, cobranças e prontuário (guarda legal).
export async function anonymizePatientAction(formData: FormData) {
  const user = await requireRole("ADMIN");
  const id = String(formData.get("patientId") ?? "");
  const p = await db.patient.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!p) redirect("/pacientes");
  if (String(formData.get("confirm") ?? "").trim() !== p.fullName) {
    redirect(`/pacientes/${id}?aba=dados&erro=${encodeURIComponent("Digite o nome completo exatamente como está no cadastro para confirmar.")}`);
  }
  await db.$transaction([
    db.patient.update({
      where: { id },
      data: {
        fullName: `Paciente anonimizado ${id.slice(-6)}`,
        cpfEnc: null,
        dedupeKey: null,
        phoneE164: null,
        email: null,
        source: null,
        tags: [],
        sex: null,
        occupation: null,
        address: null,
        emergencyName: null,
        emergencyPhone: null,
        insurance: null,
        adminNotes: null,
        birthDate: null,
        status: "INATIVO",
      },
    }),
    db.guardian.deleteMany({ where: { patientId: id } }),
    db.authorizedContact.deleteMany({ where: { patientId: id } }),
    db.consent.updateMany({ where: { patientId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    db.waitlistEntry.updateMany({ where: { patientId: id, status: "ABERTA" }, data: { status: "REMOVIDA" } }),
  ]);
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PACIENTE_ANONIMIZADO", entity: "Patient", entityId: id });
  revalidatePath("/pacientes");
  redirect(`/pacientes/${id}`);
}

// ---- Mesclar cadastros duplicados ----

// Move tudo do cadastro duplicado (drop) para o que fica (keep) e remove o duplicado.
export async function mergePatientsAction(formData: FormData) {
  const user = await requireRole("ADMIN", "RECEPCAO");
  const keepId = String(formData.get("keepId") ?? "");
  const dropId = String(formData.get("dropId") ?? "");
  const back = (m: string): never => redirect(`/pacientes/${keepId}/mesclar?erro=${encodeURIComponent(m)}`);
  if (!keepId || !dropId || keepId === dropId) back("Selecione outro cadastro.");
  if (formData.get("confirm") !== "on") back("Confirme que entende que a ação não pode ser desfeita.");

  const [keep, drop] = await Promise.all([
    db.patient.findFirst({ where: { id: keepId, clinicId: user.clinicId } }),
    db.patient.findFirst({ where: { id: dropId, clinicId: user.clinicId } }),
  ]);
  if (!keep || !drop) return back("Cadastro não encontrado.");

  await db.$transaction([
    db.appointment.updateMany({ where: { patientId: dropId }, data: { patientId: keepId } }),
    db.charge.updateMany({ where: { patientId: dropId }, data: { patientId: keepId } }),
    db.clinicalRecord.updateMany({ where: { patientId: dropId }, data: { patientId: keepId } }),
    db.waConversation.updateMany({ where: { patientId: dropId }, data: { patientId: keepId } }),
    db.waitlistEntry.updateMany({ where: { patientId: dropId }, data: { patientId: keepId } }),
    db.package.updateMany({ where: { patientId: dropId }, data: { patientId: keepId } }),
    db.consent.updateMany({ where: { patientId: dropId }, data: { patientId: keepId } }),
    db.guardian.updateMany({ where: { patientId: dropId }, data: { patientId: keepId } }),
    db.authorizedContact.updateMany({ where: { patientId: dropId }, data: { patientId: keepId } }),
    db.contactPreference.updateMany({ where: { patientId: dropId }, data: { patientId: keepId } }),
    db.scaleAssignment.updateMany({ where: { patientId: dropId }, data: { patientId: keepId } }),
    db.therapyPlan.updateMany({ where: { patientId: dropId }, data: { patientId: keepId } }),
    db.documentAcceptance.deleteMany({ where: { patientId: dropId, documentId: { in: (await db.documentAcceptance.findMany({ where: { patientId: keepId }, select: { documentId: true } })).map((a) => a.documentId) } } }),
    db.documentAcceptance.updateMany({ where: { patientId: dropId }, data: { patientId: keepId } }),
    // completa campos vazios do cadastro mantido com os do duplicado
    db.patient.update({
      where: { id: keepId },
      data: {
        birthDate: keep.birthDate ?? drop.birthDate,
        cpfEnc: keep.cpfEnc ?? drop.cpfEnc,
        dedupeKey: keep.dedupeKey ?? drop.dedupeKey,
        phoneE164: keep.phoneE164 ?? drop.phoneE164,
        email: keep.email ?? drop.email,
        sex: keep.sex ?? drop.sex,
        occupation: keep.occupation ?? drop.occupation,
        address: keep.address ?? drop.address,
        emergencyName: keep.emergencyName ?? drop.emergencyName,
        emergencyPhone: keep.emergencyPhone ?? drop.emergencyPhone,
        insurance: keep.insurance ?? drop.insurance,
        tags: [...new Set([...keep.tags, ...drop.tags])].slice(0, 10),
      },
    }),
    db.patient.delete({ where: { id: dropId } }),
  ]);
  await audit({ clinicId: user.clinicId, userId: user.id, action: "PACIENTES_MESCLADOS", entity: "Patient", entityId: keepId });
  revalidatePath("/pacientes");
  redirect(`/pacientes/${keepId}`);
}
