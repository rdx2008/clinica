"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { audit, clientIp } from "@/lib/audit";
import { TERM_TEMPLATES } from "@/lib/terms-templates";
import { getPortalSession, patientsForEmail } from "@/lib/portal";
import { patientScope } from "@/lib/clinical";

const KIND = ["TCLE", "CONTRATO", "OUTRO"];

function back(msg?: string, ok?: string): never {
  const q = msg ? `?erro=${encodeURIComponent(msg)}` : ok ? `?ok=${encodeURIComponent(ok)}` : "";
  redirect(`/configuracoes/termos${q}`);
}

// ---- Administração: criar e versionar termos ----

export async function seedTermsAction() {
  const admin = await requireRole("ADMIN");
  for (const t of TERM_TEMPLATES) {
    const exists = await db.clinicDocument.findFirst({ where: { clinicId: admin.clinicId, key: t.key }, select: { id: true } });
    if (!exists) await db.clinicDocument.create({ data: { clinicId: admin.clinicId, key: t.key, kind: t.kind, title: t.title, body: t.body, version: 1 } });
  }
  await audit({ clinicId: admin.clinicId, userId: admin.id, action: "TERMOS_MODELOS_CRIADOS", entity: "ClinicDocument" });
  back(undefined, "Modelos criados. Revise o texto com o responsável técnico e o jurídico antes de publicar para os pacientes.");
}

// Salvar = nova versão (as anteriores ficam guardadas, e quem já aceitou continua com o aceite da versão que viu).
export async function saveTermAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const key = String(formData.get("key") ?? "").trim().toLowerCase();
  const kind = String(formData.get("kind") ?? "OUTRO");
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!/^[a-z0-9-]{2,40}$/.test(key)) return back("Identificador inválido (2 a 40 letras minúsculas, números ou hífen).");
  if (!KIND.includes(kind)) return back("Tipo inválido.");
  if (title.length < 5 || title.length > 200) return back("Informe o título (5 a 200 caracteres).");
  if (body.length < 50 || body.length > 20000) return back("O texto deve ter entre 50 e 20000 caracteres.");

  const last = await db.clinicDocument.findFirst({ where: { clinicId: admin.clinicId, key }, orderBy: { version: "desc" } });
  const version = (last?.version ?? 0) + 1;
  await db.$transaction([
    db.clinicDocument.updateMany({ where: { clinicId: admin.clinicId, key }, data: { active: false } }),
    db.clinicDocument.create({ data: { clinicId: admin.clinicId, key, kind, title, body, version, active: true } }),
  ]);
  await audit({ clinicId: admin.clinicId, userId: admin.id, action: `TERMO_PUBLICADO_V${version}`, entity: "ClinicDocument", entityId: key });
  back(undefined, `Versão ${version} publicada. Os pacientes serão convidados a aceitar a nova versão.`);
}

export async function deactivateTermAction(formData: FormData) {
  const admin = await requireRole("ADMIN");
  const key = String(formData.get("key") ?? "");
  await db.clinicDocument.updateMany({ where: { clinicId: admin.clinicId, key, active: true }, data: { active: false } });
  await audit({ clinicId: admin.clinicId, userId: admin.id, action: "TERMO_DESATIVADO", entity: "ClinicDocument", entityId: key });
  back(undefined, "Documento desativado (o histórico de aceites é mantido).");
}

// ---- Aceite pelo paciente (portal) ----

export async function acceptTermPortalAction(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const docId = String(formData.get("docId") ?? "");
  const s = await getPortalSession(slug);
  if (!s) redirect(`/p/${slug}`);
  const patients = await patientsForEmail(s.clinic.id, s.email);
  const patientId = String(formData.get("patientId") ?? "");
  const fail = (m: string): never => redirect(`/p/${slug}/termo/${docId}?erro=${encodeURIComponent(m)}`);

  if (!patients.some((p) => p.id === patientId)) return fail("Selecione o paciente.");
  const doc = await db.clinicDocument.findFirst({ where: { id: docId, clinicId: s.clinic.id, active: true } });
  if (!doc) redirect(`/p/${slug}/inicio`);
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 3 || name.length > 120) return fail("Digite o nome completo de quem está aceitando.");
  if (formData.get("agree") !== "on") return fail("Marque que leu e concorda.");

  try {
    await db.documentAcceptance.create({
      data: {
        clinicId: s.clinic.id,
        patientId,
        documentId: doc.id,
        method: "PORTAL",
        acceptedByName: name,
        relation: String(formData.get("relation") ?? "").trim().slice(0, 60) || "próprio",
        ip: await clientIp(),
      },
    });
  } catch {
    // já aceito: segue normalmente
  }
  await db.auditLog.create({ data: { clinicId: s.clinic.id, action: "TERMO_ACEITO_PORTAL", entity: "ClinicDocument", entityId: doc.id } });
  revalidatePath(`/p/${slug}/inicio`);
  redirect(`/p/${slug}/inicio`);
}

// ---- Aceite presencial (equipe) ----

export async function acceptTermInPersonAction(formData: FormData) {
  const user = await requireRole("ADMIN", "RECEPCAO", "PROFISSIONAL");
  const patientId = String(formData.get("patientId") ?? "");
  const back2 = (m?: string): never => redirect(`/pacientes/${patientId}?aba=dados${m ? `&erro=${encodeURIComponent(m)}` : ""}`);
  const [patient, doc] = await Promise.all([
    db.patient.findFirst({ where: { id: patientId, clinicId: user.clinicId, AND: [patientScope(user)] }, select: { id: true } }),
    db.clinicDocument.findFirst({ where: { id: String(formData.get("docId") ?? ""), clinicId: user.clinicId, active: true } }),
  ]);
  if (!patient || !doc) return back2("Paciente ou documento não encontrado.");
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 3) return back2("Informe o nome de quem assinou.");

  try {
    await db.documentAcceptance.create({
      data: { clinicId: user.clinicId, patientId, documentId: doc.id, method: "PRESENCIAL", acceptedByName: name, relation: String(formData.get("relation") ?? "").trim().slice(0, 60) || "próprio" },
    });
    await audit({ clinicId: user.clinicId, userId: user.id, action: "TERMO_ACEITO_PRESENCIAL", entity: "ClinicDocument", entityId: doc.id });
  } catch {
    return back2("Esse documento já tem aceite registrado.");
  }
  back2();
}
