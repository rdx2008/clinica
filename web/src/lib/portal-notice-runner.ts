import { Prisma } from "@prisma/client";
import { db } from "./db";
import { decryptField, encryptField } from "./crypto";
import { placeholderCount, renderTemplate, sendTemplate, waToE164 } from "./whatsapp";
import { noticeVars, portalUrl, type NoticeKind } from "./portal-notice-core";

const MAX_PER_RUN = 100;
const TERMS_HORIZON_MS = 14 * 24 * 3600_000; // termos: só para quem tem consulta nos próximos 14 dias

// Avisa por WhatsApp (modelo aprovado, automação "PENDENCIA") o paciente que tem pendência no portal:
// questionário enviado, tarefa combinada ou termo para aceitar. Um aviso por item, nunca repete.
export async function runPortalNotices(now: Date = new Date()) {
  const stats = { enviados: 0, falhas: 0, ignorados: 0 };
  const automations = await db.automation.findMany({
    where: { active: true, trigger: "PENDENCIA", template: { status: "APROVADO" } },
    include: { template: true },
  });

  for (const auto of automations) {
    const clinic = await db.clinic.findUnique({ where: { id: auto.clinicId }, select: { portalSlug: true } });
    const url = portalUrl(process.env.APP_URL ?? process.env.COOLIFY_URL, clinic?.portalSlug ?? null);
    const account = await db.waAccount.findFirst({ where: { clinicId: auto.clinicId, status: "ATIVA" } });
    if (!url || !account) continue;
    const token = decryptField(account.tokenEnc);

    // Pendências por paciente.
    const items = new Map<string, { kind: NoticeKind; refId: string }[]>();
    const add = (patientId: string, kind: NoticeKind, refId: string) => {
      const list = items.get(patientId) ?? [];
      list.push({ kind, refId });
      items.set(patientId, list);
    };

    const [scales, tasks, docs, upcoming] = await Promise.all([
      db.scaleAssignment.findMany({ where: { clinicId: auto.clinicId, status: "PENDENTE" }, select: { id: true, patientId: true }, take: 300 }),
      db.patientTask.findMany({ where: { clinicId: auto.clinicId, status: "PENDENTE" }, select: { id: true, patientId: true }, take: 300 }),
      db.clinicDocument.findMany({ where: { clinicId: auto.clinicId, active: true }, select: { id: true } }),
      db.appointment.findMany({
        where: { clinicId: auto.clinicId, status: { in: ["AGENDADA", "CONFIRMADA"] }, startsAt: { gt: now, lt: new Date(now.getTime() + TERMS_HORIZON_MS) } },
        select: { patientId: true },
        distinct: ["patientId"],
        take: 300,
      }),
    ]);
    for (const s of scales) add(s.patientId, "ESCALA", s.id);
    for (const t of tasks) add(t.patientId, "TAREFA", t.id);
    if (docs.length > 0 && upcoming.length > 0) {
      const accepted = await db.documentAcceptance.findMany({
        where: { clinicId: auto.clinicId, patientId: { in: upcoming.map((u) => u.patientId) }, documentId: { in: docs.map((d) => d.id) } },
        select: { patientId: true, documentId: true },
      });
      const done = new Set(accepted.map((a) => `${a.patientId}|${a.documentId}`));
      for (const u of upcoming) for (const d of docs) if (!done.has(`${u.patientId}|${d.id}`)) add(u.patientId, "TERMO", d.id);
    }
    if (items.size === 0) continue;

    // Remove o que já foi avisado.
    const sent = await db.portalNotice.findMany({
      where: { clinicId: auto.clinicId, patientId: { in: [...items.keys()] } },
      select: { patientId: true, kind: true, refId: true },
    });
    const sentKey = new Set(sent.map((n) => `${n.patientId}|${n.kind}|${n.refId}`));

    let processed = 0;
    for (const [patientId, list] of items) {
      if (processed >= MAX_PER_RUN) break;
      const fresh = list.filter((i) => !sentKey.has(`${patientId}|${i.kind}|${i.refId}`));
      if (fresh.length === 0) continue;
      processed++;

      const patient = await db.patient.findFirst({ where: { id: patientId, clinicId: auto.clinicId, status: "ATIVO" }, select: { id: true, fullName: true, phoneE164: true, email: true } });
      const optin = patient ? await db.consent.findFirst({ where: { patientId, type: "WHATSAPP_OPTIN", revokedAt: null }, select: { id: true } }) : null;
      const ok = !!patient && !!optin && !!patient.phoneE164 && !!patient.email;

      // Reserva os itens antes de enviar (idempotência entre execuções simultâneas).
      let reserved = 0;
      for (const i of fresh) {
        try {
          await db.portalNotice.create({ data: { clinicId: auto.clinicId, patientId, kind: i.kind, refId: i.refId, status: ok ? "ENVIADA" : "IGNORADA_SEM_OPTIN" } });
          reserved++;
        } catch (e) {
          if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
        }
      }
      if (reserved === 0) continue;
      if (!ok || !patient) {
        stats.ignorados++;
        continue;
      }

      const vars = noticeVars(patient.fullName.trim().split(/\s+/)[0] ?? "", url, fresh.map((i) => i.kind)).slice(0, Math.max(placeholderCount(auto.template.body), 0));
      const result = await sendTemplate({
        token,
        phoneNumberId: account.phoneNumberId,
        to: patient.phoneE164!,
        name: auto.template.name,
        language: auto.template.language,
        vars,
      });

      const contact = waToE164(patient.phoneE164!);
      const conv = await db.waConversation.upsert({
        where: { clinicId_waContact: { clinicId: auto.clinicId, waContact: contact } },
        create: { clinicId: auto.clinicId, waContact: contact, patientId, aiState: "PAUSADA" },
        update: { patientId },
      });
      await db.waMessage.create({
        data: {
          conversationId: conv.id,
          direction: "SAIDA",
          type: "template",
          body: encryptField(renderTemplate(auto.template.body, vars)),
          templateId: auto.template.id,
          waMessageId: result.ok ? result.id : null,
          status: result.ok ? "ENVIADA" : "FALHOU",
          error: result.ok ? null : result.error,
        },
      });
      if (!result.ok) {
        // Não tenta de novo sozinho (evita insistir em número inválido); fica registrado como falha.
        await db.portalNotice.updateMany({ where: { clinicId: auto.clinicId, patientId, OR: fresh.map((i) => ({ kind: i.kind, refId: i.refId })) }, data: { status: "FALHOU" } });
        stats.falhas++;
      } else stats.enviados++;
    }
  }
  return stats;
}
