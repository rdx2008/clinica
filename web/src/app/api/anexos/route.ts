import { db } from "@/lib/db";
import { encryptBuffer } from "@/lib/crypto";
import { getCurrentUser, MFA_REQUIRED } from "@/lib/session";
import { audit } from "@/lib/audit";
import { MAX_ATTACHMENTS_PER_RECORD, MAX_ATTACHMENT_BYTES, safeFileName, sniffType } from "@/lib/files";
import { randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status });

// Upload de anexo (PDF, imagem ou áudio) em um registro em rascunho do próprio profissional.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "PROFISSIONAL" || user.mustChangePassword || (MFA_REQUIRED.includes(user.role) && !user.mfaSecret)) {
    return json({ error: "Não autorizado." }, 403);
  }
  const professional = await db.professional.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!professional) return json({ error: "Perfil de profissional não encontrado." }, 403);

  // Recusa cedo corpos claramente grandes demais (o limite real é conferido depois).
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_ATTACHMENT_BYTES + 512 * 1024) return json({ error: "Arquivo maior que 10 MB." }, 413);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "Envio inválido." }, 400);
  }
  const recordId = String(form.get("recordId") ?? "");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return json({ error: "Selecione um arquivo." }, 400);
  if (file.size > MAX_ATTACHMENT_BYTES) return json({ error: "Arquivo maior que 10 MB." }, 413);

  const rec = await db.clinicalRecord.findFirst({
    where: { id: recordId, clinicId: user.clinicId, professionalId: professional.id },
    select: { id: true, status: true, _count: { select: { attachments: true } } },
  });
  if (!rec) return json({ error: "Registro não encontrado." }, 404);
  if (rec.status === "APROVADO") return json({ error: "Registro aprovado não aceita novos anexos." }, 409);
  if (rec._count.attachments >= MAX_ATTACHMENTS_PER_RECORD) return json({ error: `Máximo de ${MAX_ATTACHMENTS_PER_RECORD} anexos por registro.` }, 409);

  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniffType(buf);
  if (!type) return json({ error: "Tipo de arquivo não aceito. Envie PDF, imagem (PNG, JPG, WEBP) ou áudio (MP3, M4A, OGG, WAV, WEBM)." }, 415);

  const att = await db.clinicalAttachment.create({
    data: {
      recordId: rec.id,
      fileKey: randomBytes(16).toString("hex"),
      mime: type.mime,
      size: buf.length,
      name: safeFileName(file.name, type.ext),
      data: new Uint8Array(encryptBuffer(buf)),
      uploadedBy: user.id,
    },
    select: { id: true },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "ANEXO_ENVIADO", entity: "ClinicalRecord", entityId: rec.id });
  return json({ ok: true, id: att.id });
}
