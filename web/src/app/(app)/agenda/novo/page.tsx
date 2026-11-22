import { randomUUID } from "node:crypto";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { localDate } from "@/lib/agenda";
import { createAppointmentAction } from "@/app/actions/agenda";
import { AppointmentForm } from "./appointment-form";
import { patientScope } from "@/lib/clinical";

export const dynamic = "force-dynamic";

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; prof?: string; patient?: string; q?: string; time?: string }>;
}) {
  const user = await requireRole("ADMIN", "RECEPCAO", "PROFISSIONAL");
  const sp = await searchParams;
  const term = (sp.q ?? "").trim();

  const [professionals, services, patients, preset, rooms] = await Promise.all([
    db.professional.findMany({
      where: { clinicId: user.clinicId, ...(user.role === "PROFISSIONAL" ? { userId: user.id } : {}), user: { active: true } },
      include: { user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    db.service.findMany({ where: { clinicId: user.clinicId }, orderBy: { name: "asc" } }),
    db.patient.findMany({
      where: { clinicId: user.clinicId, status: "ATIVO", AND: [patientScope(user)], ...(term ? { fullName: { contains: term, mode: "insensitive" } } : {}) },
      orderBy: { fullName: "asc" },
      take: 50,
      select: { id: true, fullName: true },
    }),
    sp.patient
      ? db.patient.findFirst({ where: { id: sp.patient, clinicId: user.clinicId, status: "ATIVO", AND: [patientScope(user)] }, select: { id: true, fullName: true } })
      : null,
    db.room.findMany({ where: { clinicId: user.clinicId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const list = preset && !patients.some((p) => p.id === preset.id) ? [preset, ...patients] : patients;
  const plans = await db.patientInsurance.findMany({
    where: { clinicId: user.clinicId, active: true, insurer: { active: true }, patientId: { in: list.map((p) => p.id) } },
    include: { insurer: { select: { name: true } } },
  });
  const date = sp.date ?? localDate(new Date());

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href={`/agenda?date=${date}`} className="text-xs text-zinc-500 underline">← Agenda</Link>
      <h1 className="text-xl font-semibold">Novo agendamento</h1>

      <form className="flex gap-2">
        <input type="hidden" name="date" value={date} />
        {sp.prof && <input type="hidden" name="prof" value={sp.prof} />}
        {sp.time && <input type="hidden" name="time" value={sp.time} />}
        <input name="q" defaultValue={term} placeholder="Buscar paciente pelo nome" className="flex-1 rounded border px-3 py-2 text-sm" />
        <button className="rounded border px-3 py-2 text-sm">Buscar</button>
      </form>
      {list.length === 0 && (
        <p className="text-sm text-zinc-500">
          Nenhum paciente encontrado. <Link href="/pacientes/novo" className="underline">Cadastrar paciente</Link>
        </p>
      )}

      {professionals.length === 0 || services.length === 0 ? (
        <p className="rounded border p-4 text-sm text-zinc-600">É preciso ter ao menos um profissional ativo e um serviço cadastrado.</p>
      ) : (
        <AppointmentForm
          action={createAppointmentAction}
          patients={list}
          professionals={professionals.map((p) => ({ id: p.id, name: p.user.name }))}
          services={services.map((s) => ({ id: s.id, name: s.name, durationMin: s.durationMin, modality: s.modality }))}
          defaults={{
            date,
            time: /^\d{2}:\d{2}$/.test(sp.time ?? "") ? (sp.time as string) : "",
            professionalId: professionals.find((p) => p.id === sp.prof)?.id ?? professionals[0].id,
            patientId: preset?.id ?? "",
          }}
          rooms={rooms}
          insurances={plans.map((i) => ({ id: i.id, patientId: i.patientId, label: i.planName ? `${i.insurer.name} (${i.planName})` : i.insurer.name }))}
          idempotencyKey={randomUUID()}
          lockProfessional={user.role === "PROFISSIONAL"}
        />
      )}
    </div>
  );
}
