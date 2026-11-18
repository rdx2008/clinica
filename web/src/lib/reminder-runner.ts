import { Prisma } from "@prisma/client";
import { db } from "./db";
import { decryptField, encryptField } from "./crypto";
import { localDate, localTime } from "./agenda";
import { placeholderCount, renderTemplate, sendTemplate, waToE164 } from "./whatsapp";
import { reminderState, reminderVars } from "./reminders";

const HORIZON_MS = 8 * 24 * 3600_000; // só olha consultas dos próximos 8 dias

// Percorre as automações ativas e envia os lembretes que venceram. Seguro para rodar várias vezes:
// a unicidade (automação, atendimento) garante no máximo um envio por consulta.
export async function runReminders(now: Date = new Date()) {
  const stats = { enviados: 0, falhas: 0, ignorados: 0 };
  const automations = await db.automation.findMany({
    where: { active: true, trigger: "LEMBRETE", template: { status: "APROVADO" } },
    include: { template: true },
  });

  for (const auto of automations) {
    const account = await db.waAccount.findFirst({ where: { clinicId: auto.clinicId, status: "ATIVA" } });
    if (!account) continue;
    const token = decryptField(account.tokenEnc);

    const appointments = await db.appointment.findMany({
      where: {
        clinicId: auto.clinicId,
        status: { in: ["AGENDADA", "CONFIRMADA"] },
        startsAt: { gt: now, lt: new Date(now.getTime() + HORIZON_MS) },
        runs: { none: { automationId: auto.id } },
      },
      include: {
        patient: { select: { id: true, fullName: true, phoneE164: true } },
        professional: { include: { user: { select: { name: true } } } },
      },
      take: 200,
    });

    for (const a of appointments) {
      const state = reminderState(a.startsAt, auto.offsetMin, now);
      if (state === "cedo") continue;

      // Reserva o envio (idempotência): se outro processo já reservou, pula.
      let runId: string;
      try {
        const run = await db.automationRun.create({
          data: { automationId: auto.id, appointmentId: a.id, scheduledFor: now, status: "PROCESSANDO" },
        });
        runId = run.id;
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
        throw e;
      }
      const finish = (status: string) => db.automationRun.update({ where: { id: runId }, data: { status } });

      if (state !== "enviar") {
        await finish(state === "atrasado" ? "IGNORADA_ATRASO" : "IGNORADA_PROXIMA");
        stats.ignorados++;
        continue;
      }

      // Só com autorização vigente de WhatsApp e telefone válido.
      const optin = await db.consent.findFirst({ where: { patientId: a.patient.id, type: "WHATSAPP_OPTIN", revokedAt: null }, select: { id: true } });
      if (!optin || !a.patient.phoneE164) {
        await finish("IGNORADA_SEM_OPTIN");
        stats.ignorados++;
        continue;
      }

      const vars = reminderVars({
        patientName: a.patient.fullName,
        date: localDate(a.startsAt),
        time: localTime(a.startsAt),
        professional: a.professional.user.name,
      }).slice(0, Math.max(placeholderCount(auto.template.body), 0));

      const result = await sendTemplate({
        token,
        phoneNumberId: account.phoneNumberId,
        to: a.patient.phoneE164,
        name: auto.template.name,
        language: auto.template.language,
        vars,
      });

      const contact = waToE164(a.patient.phoneE164);
      const conv = await db.waConversation.upsert({
        where: { clinicId_waContact: { clinicId: auto.clinicId, waContact: contact } },
        create: { clinicId: auto.clinicId, waContact: contact, patientId: a.patient.id, aiState: "PAUSADA" },
        update: { patientId: a.patient.id },
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
      await finish(result.ok ? "ENVIADA" : "FALHOU");
      if (result.ok) stats.enviados++;
      else stats.falhas++;
    }
  }
  return stats;
}
