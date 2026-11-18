"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AppointmentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";
import { ACTIVE_STATUSES, localDate, parseLocal, validMeetingUrl, weeklyOccurrences, MAX_RECURRENCE } from "@/lib/agenda";

export type AppointmentFormState = { error?: string };

const ALLOWED = ["ADMIN", "RECEPCAO", "PROFISSIONAL"] as const;
const STATUSES = ["AGENDADA", "CONFIRMADA", "COMPARECEU", "FALTOU", "CANCELADA"] as const;
const CONFLICT = "Esse horário já está ocupado para o profissional (outro atendimento ou bloqueio).";

type Actor = Awaited<ReturnType<typeof requireRole>>;

// Profissional só mexe na própria agenda; recepção e admin, em todas da clínica.
async function ownProfessionalId(user: Actor): Promise<string | null> {
  if (user.role !== "PROFISSIONAL") return null;
  const p = await db.professional.findUnique({ where: { userId: user.id }, select: { id: true } });
  return p?.id ?? "__none__";
}

function isOverlapError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("no_overlap") || msg.includes("23P01");
}

// Há atendimento ativo ou bloqueio colidindo com algum dos intervalos?
async function hasConflict(professionalId: string, ranges: { startsAt: Date; endsAt: Date }[], exceptId?: string) {
  const or = ranges.map((r) => ({ startsAt: { lt: r.endsAt }, endsAt: { gt: r.startsAt } }));
  const [appt, block] = await Promise.all([
    db.appointment.findFirst({
      where: { professionalId, status: { in: [...ACTIVE_STATUSES] }, ...(exceptId ? { id: { not: exceptId } } : {}), OR: or },
      select: { id: true },
    }),
    db.block.findFirst({ where: { professionalId, OR: or }, select: { id: true } }),
  ]);
  return !!(appt || block);
}

const createSchema = z.object({
  patientId: z.string().min(1, "Selecione o paciente"),
  professionalId: z.string().min(1, "Selecione o profissional"),
  serviceId: z.string().min(1, "Selecione o serviço"),
  date: z.string(),
  time: z.string(),
  repeat: z.coerce.number().int().min(1).max(MAX_RECURRENCE).default(1),
  meetingUrl: z.string().trim().optional(),
  idempotencyKey: z.string().min(8).max(100),
});

export async function createAppointmentAction(_prev: AppointmentFormState, formData: FormData): Promise<AppointmentFormState> {
  const user = await requireRole(...ALLOWED);
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const own = await ownProfessionalId(user);
  const professionalId = own ?? d.professionalId;
  if (own === "__none__") return { error: "Seu usuário não tem perfil de profissional." };

  const [patient, professional, service] = await Promise.all([
    db.patient.findFirst({ where: { id: d.patientId, clinicId: user.clinicId, status: "ATIVO" }, select: { id: true } }),
    db.professional.findFirst({ where: { id: professionalId, clinicId: user.clinicId }, select: { id: true, defaultMeetingUrl: true } }),
    db.service.findFirst({ where: { id: d.serviceId, clinicId: user.clinicId } }),
  ]);
  if (!patient) return { error: "Paciente não encontrado ou inativo." };
  if (!professional) return { error: "Profissional não encontrado." };
  if (!service) return { error: "Serviço não encontrado." };

  const start = parseLocal(d.date, d.time);
  if (!start) return { error: "Data ou horário inválido." };
  const end = new Date(start.getTime() + service.durationMin * 60_000);
  const occurrences = weeklyOccurrences(start, end, d.repeat);

  let meetingUrl: string | null = null;
  if (service.modality === "ONLINE") {
    const url = d.meetingUrl || professional.defaultMeetingUrl;
    if (d.meetingUrl && !validMeetingUrl(d.meetingUrl)) return { error: "Link da videochamada inválido (use http:// ou https://)." };
    meetingUrl = url || null;
  }

  if (await hasConflict(professional.id, occurrences)) {
    return { error: d.repeat > 1 ? `${CONFLICT} Nenhuma sessão da série foi criada.` : CONFLICT };
  }

  // Reenvio do mesmo formulário (duplo clique, retry): a chave de idempotência evita duplicar.
  const already = await db.appointment.findUnique({ where: { idempotencyKey: `${d.idempotencyKey}-0` }, select: { id: true } });
  if (already) redirect(`/agenda?date=${d.date}&prof=${professional.id}`);

  try {
    await db.$transaction(async (tx) => {
      const recurrence = occurrences.length > 1 ? await tx.recurrence.create({ data: { rrule: `FREQ=WEEKLY;COUNT=${occurrences.length}` } }) : null;
      for (const [i, o] of occurrences.entries()) {
        const a = await tx.appointment.create({
          data: {
            clinicId: user.clinicId,
            patientId: patient.id,
            professionalId: professional.id,
            serviceId: service.id,
            startsAt: o.startsAt,
            endsAt: o.endsAt,
            recurrenceId: recurrence?.id ?? null,
            source: "MANUAL",
            meetingUrl,
            idempotencyKey: `${d.idempotencyKey}-${i}`,
          },
        });
        await tx.auditLog.create({
          data: { clinicId: user.clinicId, userId: user.id, action: "AGENDAMENTO_CRIADO", entity: "Appointment", entityId: a.id },
        });
      }
    });
  } catch (e) {
    // O banco é a barreira final contra horário duplo, mesmo com dois usuários ao mesmo tempo.
    if (isOverlapError(e)) return { error: CONFLICT };
    throw e;
  }

  revalidatePath("/agenda");
  redirect(`/agenda?date=${d.date}&prof=${professional.id}`);
}

async function loadAppointment(user: Actor, id: string) {
  const own = await ownProfessionalId(user);
  const a = await db.appointment.findFirst({
    where: { id, clinicId: user.clinicId, ...(own ? { professionalId: own } : {}) },
  });
  return a;
}

function backToDetail(id: string, msg?: string): never {
  redirect(`/agenda/${id}${msg ? `?erro=${encodeURIComponent(msg)}` : ""}`);
}

export async function setStatusAction(formData: FormData) {
  const user = await requireRole(...ALLOWED);
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as (typeof STATUSES)[number];
  if (!STATUSES.includes(status)) backToDetail(id, "Status inválido.");
  const a = await loadAppointment(user, id);
  if (!a) redirect("/agenda");

  // Reativar um atendimento cancelado volta a ocupar o horário: precisa checar conflito.
  const reactivating = (a.status === "CANCELADA" || a.status === "REMARCADA") && status !== "CANCELADA";
  if (reactivating && (await hasConflict(a.professionalId, [{ startsAt: a.startsAt, endsAt: a.endsAt }], a.id))) {
    backToDetail(id, CONFLICT);
  }
  try {
    await db.appointment.update({ where: { id }, data: { status: status as AppointmentStatus } });
  } catch (e) {
    if (isOverlapError(e)) backToDetail(id, CONFLICT);
    throw e;
  }
  await audit({ clinicId: user.clinicId, userId: user.id, action: `AGENDAMENTO_${status}`, entity: "Appointment", entityId: id });
  revalidatePath("/agenda");
  redirect(`/agenda?date=${localDate(a.startsAt)}&prof=${a.professionalId}`);
}

export async function rescheduleAction(formData: FormData) {
  const user = await requireRole(...ALLOWED);
  const id = String(formData.get("id") ?? "");
  const a = await loadAppointment(user, id);
  if (!a) redirect("/agenda");
  const start = parseLocal(String(formData.get("date") ?? ""), String(formData.get("time") ?? ""));
  if (!start) backToDetail(id, "Data ou horário inválido.");
  const end = new Date(start.getTime() + (a.endsAt.getTime() - a.startsAt.getTime()));

  if (await hasConflict(a.professionalId, [{ startsAt: start, endsAt: end }], a.id)) backToDetail(id, CONFLICT);
  try {
    await db.$transaction([
      db.appointment.update({ where: { id }, data: { startsAt: start, endsAt: end, status: "AGENDADA" } }),
      // Novo horário: libera os lembretes já enviados para serem reenviados.
      db.automationRun.deleteMany({ where: { appointmentId: id } }),
    ]);
  } catch (e) {
    if (isOverlapError(e)) backToDetail(id, CONFLICT);
    throw e;
  }
  await audit({ clinicId: user.clinicId, userId: user.id, action: "AGENDAMENTO_REMARCADO", entity: "Appointment", entityId: id });
  revalidatePath("/agenda");
  redirect(`/agenda?date=${localDate(start)}&prof=${a.professionalId}`);
}

export async function setMeetingUrlAction(formData: FormData) {
  const user = await requireRole(...ALLOWED);
  const id = String(formData.get("id") ?? "");
  const a = await loadAppointment(user, id);
  if (!a) redirect("/agenda");
  const url = String(formData.get("meetingUrl") ?? "").trim();
  if (url && !validMeetingUrl(url)) backToDetail(id, "Link inválido (use http:// ou https://).");
  await db.appointment.update({ where: { id }, data: { meetingUrl: url || null } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "AGENDAMENTO_LINK_ALTERADO", entity: "Appointment", entityId: id });
  backToDetail(id);
}

// ---- Bloqueios de agenda (folga, férias, reunião) ----

const blockSchema = z.object({
  professionalId: z.string().min(1),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  reason: z.string().trim().max(120).optional(),
});

export async function addBlockAction(formData: FormData) {
  const user = await requireRole(...ALLOWED);
  const parsed = blockSchema.safeParse(Object.fromEntries(formData));
  const fail = (m: string): never => redirect(`/agenda?erro=${encodeURIComponent(m)}`);
  if (!parsed.success) return fail("Dados do bloqueio inválidos.");
  const d = parsed.data;
  const own = await ownProfessionalId(user);
  const professionalId = own ?? d.professionalId;
  const prof = await db.professional.findFirst({ where: { id: professionalId, clinicId: user.clinicId }, select: { id: true } });
  if (!prof) return fail("Profissional não encontrado.");

  const start = parseLocal(d.date, d.startTime);
  const end = parseLocal(d.date, d.endTime);
  if (!start || !end || end <= start) return fail("Horário do bloqueio inválido.");
  if (await hasConflict(prof.id, [{ startsAt: start, endsAt: end }])) {
    return fail("Já existe atendimento nesse período. Cancele ou remarque antes de bloquear.");
  }
  const b = await db.block.create({ data: { professionalId: prof.id, startsAt: start, endsAt: end, reason: d.reason || null } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "BLOQUEIO_CRIADO", entity: "Block", entityId: b.id });
  revalidatePath("/agenda");
  redirect(`/agenda?date=${d.date}&prof=${prof.id}`);
}

export async function removeBlockAction(formData: FormData) {
  const user = await requireRole(...ALLOWED);
  const id = String(formData.get("id") ?? "");
  const own = await ownProfessionalId(user);
  const b = await db.block.findFirst({
    where: { id, professional: { clinicId: user.clinicId, ...(own ? { id: own } : {}) } },
  });
  if (!b) redirect("/agenda");
  await db.block.delete({ where: { id } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "BLOQUEIO_REMOVIDO", entity: "Block", entityId: id });
  revalidatePath("/agenda");
  redirect(`/agenda?date=${localDate(b.startsAt)}&prof=${b.professionalId}`);
}

// ---- Link padrão de atendimento online do profissional ----

export async function setDefaultMeetingUrlAction(formData: FormData) {
  const user = await requireRole("PROFISSIONAL");
  const url = String(formData.get("defaultMeetingUrl") ?? "").trim();
  if (url && !validMeetingUrl(url)) redirect(`/agenda?erro=${encodeURIComponent("Link inválido (use http:// ou https://).")}`);
  await db.professional.update({ where: { userId: user.id }, data: { defaultMeetingUrl: url || null } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "LINK_PADRAO_ALTERADO", entity: "Professional", entityId: user.id });
  redirect("/agenda");
}

// ---- Serviços (tipos de atendimento) ----

const serviceSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do serviço"),
  durationMin: z.coerce.number().int().min(10, "Duração mínima de 10 min").max(480, "Duração máxima de 8 h"),
  price: z.string().trim(),
  modality: z.enum(["PRESENCIAL", "ONLINE"]),
});

export async function createServiceAction(formData: FormData) {
  const user = await requireRole("ADMIN");
  const parsed = serviceSchema.safeParse(Object.fromEntries(formData));
  const back = (m: string): never => redirect(`/servicos?erro=${encodeURIComponent(m)}`);
  if (!parsed.success) return back(parsed.error.issues[0].message);
  const d = parsed.data;
  const price = Number(d.price.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(price) || price < 0) return back("Valor inválido.");
  const s = await db.service.create({
    data: { clinicId: user.clinicId, name: d.name, durationMin: d.durationMin, priceCents: Math.round(price * 100), modality: d.modality },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "SERVICO_CRIADO", entity: "Service", entityId: s.id });
  revalidatePath("/servicos");
  redirect("/servicos");
}
