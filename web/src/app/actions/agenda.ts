"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AppointmentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";
import { parseBRL } from "@/lib/money";
import { checkAuth, expectedPayDate } from "@/lib/insurance-core";
import { ACTIVE_STATUSES, localDate, withinAvailability, parseLocal, validMeetingUrl, weeklyOccurrences, MAX_RECURRENCE } from "@/lib/agenda";

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
  roomId: z.string().optional(),
  insuranceId: z.string().optional(),
  idempotencyKey: z.string().min(8).max(100),
});

const HOLDS_SESSION = ["AGENDADA", "CONFIRMADA", "COMPARECEU"] as const;

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

  let roomId: string | null = null;
  if (d.roomId) {
    const room = await db.room.findFirst({ where: { id: d.roomId, clinicId: user.clinicId }, select: { id: true } });
    if (!room) return { error: "Sala não encontrada." };
    roomId = room.id;
  }

  let meetingUrl: string | null = null;
  if (service.modality === "ONLINE") {
    const url = d.meetingUrl || professional.defaultMeetingUrl;
    if (d.meetingUrl && !validMeetingUrl(d.meetingUrl)) return { error: "Link da videochamada inválido (use http:// ou https://)." };
    meetingUrl = url || null;
  }

  if (formData.get("outside") !== "on") {
    const windows = await db.availability.findMany({ where: { professionalId: professional.id } });
    if (occurrences.some((o) => !withinAvailability(o.startsAt, o.endsAt, windows))) {
      return { error: "Fora do horário de atendimento do profissional. Marque \"Encaixe\" para agendar mesmo assim." };
    }
  }

  if (await hasConflict(professional.id, occurrences)) {
    return { error: d.repeat > 1 ? `${CONFLICT} Nenhuma sessão da série foi criada.` : CONFLICT };
  }

  // Atendimento pelo convênio: carteirinha válida, valor do serviço na tabela e autorização com sessões.
  let patientInsuranceId: string | null = null;
  let authorizationId: string | null = null;
  if (d.insuranceId) {
    const ins = await db.patientInsurance.findFirst({
      where: { id: d.insuranceId, clinicId: user.clinicId, patientId: patient.id, active: true },
      include: { insurer: true, authorizations: { orderBy: { createdAt: "asc" } } },
    });
    if (!ins || !ins.insurer.active) return { error: "Carteirinha do convênio não encontrada ou inativa." };
    const last = occurrences[occurrences.length - 1].startsAt;
    if (ins.validUntil && ins.validUntil.getTime() < last.getTime()) return { error: "A carteirinha vence antes da última sessão. Atualize a validade ou agende como particular." };
    const price = await db.insurerPrice.findUnique({ where: { insurerId_serviceId: { insurerId: ins.insurerId, serviceId: service.id } }, select: { id: true } });
    if (!price) return { error: `O convênio ${ins.insurer.name} não tem valor definido para este serviço (Financeiro → Convênios).` };
    if (ins.authorizations.length > 0) {
      let reason = "";
      for (const a of ins.authorizations) {
        const used = await db.appointment.count({ where: { authorizationId: a.id, status: { in: [...HOLDS_SESSION] } } });
        const check = checkAuth(a, used, last);
        if (check.ok && check.remaining >= occurrences.length) {
          authorizationId = a.id;
          break;
        }
        reason = check.ok ? `A autorização ${a.code} tem só ${check.remaining} sessão(ões) e a série tem ${occurrences.length}.` : check.reason;
      }
      if (!authorizationId) return { error: `${reason} Cadastre uma nova autorização na ficha do paciente.` };
    }
    patientInsuranceId = ins.id;
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
            roomId,
            source: "MANUAL",
            meetingUrl,
            patientInsuranceId,
            authorizationId,
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

// Atendimento de convênio já faturado em lote ou recebido não muda de status nem de data.
async function billingLock(appointmentId: string): Promise<string | null> {
  const e = await db.insuranceEntry.findUnique({ where: { appointmentId }, select: { status: true, guideNumber: true } });
  if (!e) return null;
  if (e.status === "FATURADO") return `Atendimento já faturado (guia ${e.guideNumber}). Tire-o do lote em Financeiro → Convênios antes de alterar.`;
  if (e.status !== "A_FATURAR" && e.status !== "CANCELADO") return "Atendimento já teve retorno do convênio (recebimento ou glosa). Estorne em Financeiro → Convênios antes de alterar.";
  return null;
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
  if (status !== "COMPARECEU" && a.patientInsuranceId) {
    const lock = await billingLock(id);
    if (lock) backToDetail(id, lock);
  }
  try {
    const reason = String(formData.get("reason") ?? "").trim().slice(0, 200);
    await db.$transaction(async (tx) => {
      let packageId = a.packageId;
      // Pacote de sessões: comparecer consome uma sessão; desfazer devolve.
      if (status === "COMPARECEU" && !packageId && !a.patientInsuranceId) {
        const pkgs = await tx.package.findMany({ where: { patientId: a.patientId, serviceId: a.serviceId, clinicId: user.clinicId }, orderBy: { createdAt: "asc" } });
        const open = pkgs.find((p) => p.sessionsUsed < p.sessionsTotal && (!p.validUntil || p.validUntil.getTime() >= a.startsAt.getTime()));
        if (open) {
          await tx.package.update({ where: { id: open.id }, data: { sessionsUsed: { increment: 1 } } });
          packageId = open.id;
        }
      } else if (status !== "COMPARECEU" && packageId) {
        await tx.package.update({ where: { id: packageId }, data: { sessionsUsed: { decrement: 1 } } });
        packageId = null;
      }
      await tx.appointment.update({
        where: { id },
        data: {
          status: status as AppointmentStatus,
          packageId,
          cancelReason: status === "CANCELADA" ? reason || null : null,
          cancelledAt: status === "CANCELADA" ? new Date() : null,
        },
      });
      // Convênio: comparecer gera o valor a receber; qualquer outro status desfaz o que ainda não foi recebido.
      if (a.patientInsuranceId) {
        if (status === "COMPARECEU") {
          const ins = await tx.patientInsurance.findUnique({ where: { id: a.patientInsuranceId }, include: { insurer: true } });
          const price = ins ? await tx.insurerPrice.findUnique({ where: { insurerId_serviceId: { insurerId: ins.insurerId, serviceId: a.serviceId } } }) : null;
          if (ins && price) {
            const date = localDate(a.startsAt);
            const data = { amountCents: price.priceCents, expectedDate: expectedPayDate(date, ins.insurer.paymentDays) };
            const existing = await tx.insuranceEntry.findUnique({ where: { appointmentId: id } });
            if (!existing) {
              await tx.insuranceEntry.create({
                data: { clinicId: user.clinicId, insurerId: ins.insurerId, patientId: a.patientId, professionalId: a.professionalId, appointmentId: id, serviceDate: new Date(`${date}T00:00:00.000Z`), competence: date.slice(0, 7), ...data },
              });
            } else if (existing.status !== "PAGO") {
              await tx.insuranceEntry.update({ where: { id: existing.id }, data: { ...data, status: "A_FATURAR" } });
            }
          }
        } else {
          await tx.insuranceEntry.updateMany({ where: { appointmentId: id, status: "A_FATURAR" }, data: { status: "CANCELADO" } });
        }
      }
    });
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
  if (a.patientInsuranceId) {
    const lock = await billingLock(id);
    if (lock) backToDetail(id, lock);
  }
  const end = new Date(start.getTime() + (a.endsAt.getTime() - a.startsAt.getTime()));

  if (formData.get("outside") !== "on") {
    const windows = await db.availability.findMany({ where: { professionalId: a.professionalId } });
    if (!withinAvailability(start, end, windows)) backToDetail(id, "Fora do horário de atendimento do profissional. Marque \"Encaixe\" para remarcar mesmo assim.");
  }
  if (await hasConflict(a.professionalId, [{ startsAt: start, endsAt: end }], a.id)) backToDetail(id, CONFLICT);
  try {
    await db.$transaction([
      db.appointment.update({ where: { id }, data: { startsAt: start, endsAt: end, status: "AGENDADA", packageId: null, cancelReason: null, cancelledAt: null } }),
      ...(a.packageId ? [db.package.update({ where: { id: a.packageId }, data: { sessionsUsed: { decrement: 1 } } })] : []),
      // Novo horário: libera os lembretes já enviados para serem reenviados.
      db.automationRun.deleteMany({ where: { appointmentId: id } }),
      db.insuranceEntry.updateMany({ where: { appointmentId: id, status: "A_FATURAR" }, data: { status: "CANCELADO" } }),
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
  const priceCents = parseBRL(d.price);
  if (priceCents === null) return back("Valor inválido.");
  const s = await db.service.create({
    data: { clinicId: user.clinicId, name: d.name, durationMin: d.durationMin, priceCents, modality: d.modality },
  });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "SERVICO_CRIADO", entity: "Service", entityId: s.id });
  revalidatePath("/servicos");
  redirect("/servicos");
}

// ---- Disponibilidade semanal do profissional ----

const availabilitySchema = z.object({
  professionalId: z.string().min(1),
  weekday: z.coerce.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

export async function addAvailabilityAction(formData: FormData) {
  const user = await requireRole(...ALLOWED);
  const parsed = availabilitySchema.safeParse(Object.fromEntries(formData));
  const fail = (pid: string, m: string): never => redirect(`/agenda/disponibilidade?prof=${encodeURIComponent(pid)}&erro=${encodeURIComponent(m)}`);
  const pid = String(formData.get("professionalId") ?? "");
  if (!parsed.success) return fail(pid, "Dados inválidos.");
  const d = parsed.data;
  const own = await ownProfessionalId(user);
  const professionalId = own ?? d.professionalId;
  const prof = await db.professional.findFirst({ where: { id: professionalId, clinicId: user.clinicId }, select: { id: true } });
  if (!prof) redirect("/agenda");
  if (d.endTime <= d.startTime) return fail(prof.id, "O horário final deve ser depois do inicial.");
  const clash = await db.availability.findFirst({
    where: { professionalId: prof.id, weekday: d.weekday, startTime: { lt: d.endTime }, endTime: { gt: d.startTime } },
    select: { id: true },
  });
  if (clash) return fail(prof.id, "Já existe um horário que se sobrepõe a esse no mesmo dia.");
  const row = await db.availability.create({ data: { professionalId: prof.id, weekday: d.weekday, startTime: d.startTime, endTime: d.endTime } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "DISPONIBILIDADE_CRIADA", entity: "Availability", entityId: row.id });
  redirect(`/agenda/disponibilidade?prof=${prof.id}`);
}

export async function removeAvailabilityAction(formData: FormData) {
  const user = await requireRole(...ALLOWED);
  const id = String(formData.get("id") ?? "");
  const own = await ownProfessionalId(user);
  const row = await db.availability.findFirst({
    where: { id, professional: { clinicId: user.clinicId, ...(own ? { id: own } : {}) } },
  });
  if (!row) redirect("/agenda");
  await db.availability.delete({ where: { id } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "DISPONIBILIDADE_REMOVIDA", entity: "Availability", entityId: id });
  redirect(`/agenda/disponibilidade?prof=${row.professionalId}`);
}
