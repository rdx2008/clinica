import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { decryptBuffer } from "@/lib/crypto";
import { getCurrentUser, MFA_REQUIRED } from "@/lib/session";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const INLINE = ["application/pdf", "image/png", "image/jpeg", "image/webp", "audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav", "audio/webm"];

// Download/visualização de anexo: só o autor do registro ou um colega com compartilhamento vigente.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "PROFISSIONAL" || user.mustChangePassword || (MFA_REQUIRED.includes(user.role) && !user.mfaSecret)) {
    return new Response("Forbidden", { status: 403 });
  }
  const professional = await db.professional.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!professional) return new Response("Forbidden", { status: 403 });

  const { id } = await ctx.params;
  const att = await db.clinicalAttachment.findUnique({
    where: { id },
    include: { record: { select: { id: true, clinicId: true, professionalId: true, type: true, grants: true } } },
  });
  if (!att || !att.data || att.record.clinicId !== user.clinicId) return new Response("Not found", { status: 404 });

  const isAuthor = att.record.professionalId === professional.id;
  const now = new Date();
  const granted = att.record.grants.some((g) => g.granteeId === professional.id && (!g.expiresAt || g.expiresAt > now));
  if (!isAuthor && (!granted || att.record.type === "ANOTACAO_PESSOAL")) return new Response("Not found", { status: 404 });

  await audit({ clinicId: user.clinicId, userId: user.id, action: isAuthor ? "ANEXO_BAIXADO" : "ANEXO_BAIXADO_COMPARTILHADO", entity: "ClinicalRecord", entityId: att.record.id });

  const body = decryptBuffer(Buffer.from(att.data));
  // Documento assinado: confere a impressão digital gravada no envio. Se divergir, o arquivo foi alterado.
  if (att.sha256 && createHash("sha256").update(body).digest("hex") !== att.sha256) {
    await audit({ clinicId: user.clinicId, userId: user.id, action: "ANEXO_INTEGRIDADE_FALHOU", entity: "ClinicalRecord", entityId: att.record.id });
    return new Response("O arquivo não confere com a impressão digital registrada.", { status: 409 });
  }
  const inline = INLINE.includes(att.mime);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": att.mime,
      "Content-Length": String(body.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(att.name || "arquivo")}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cache-Control": "private, no-store",
    },
  });
}
