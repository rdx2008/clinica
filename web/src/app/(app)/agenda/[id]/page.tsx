import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { localDate, localTime, STATUS_LABEL } from "@/lib/agenda";
import { formatPhoneBR } from "@/lib/br";
import { rescheduleAction, setMeetingUrlAction, setStatusAction } from "@/app/actions/agenda";

export const dynamic = "force-dynamic";

const input = "rounded border px-2 py-1 text-sm";
const btn = "rounded border px-2 py-1 text-xs";

export default async function AppointmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const user = await requireRole("ADMIN", "RECEPCAO", "PROFISSIONAL");
  const { id } = await params;
  const { erro } = await searchParams;

  const a = await db.appointment.findFirst({
    where: { id, clinicId: user.clinicId, ...(user.role === "PROFISSIONAL" ? { professional: { userId: user.id } } : {}) },
    include: {
      patient: { select: { id: true, fullName: true, phoneE164: true } },
      service: true,
      professional: { include: { user: { select: { name: true } } } },
    },
  });
  if (!a) notFound();

  const date = localDate(a.startsAt);
  const online = a.service.modality === "ONLINE";
  const statuses = ["CONFIRMADA", "COMPARECEU", "FALTOU", "CANCELADA", "AGENDADA"].filter((s) => s !== a.status);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href={`/agenda?date=${date}&prof=${a.professionalId}`} className="text-xs text-zinc-500 underline">← Agenda</Link>
      <h1 className="text-xl font-semibold">
        {a.patient.fullName} <span className="text-sm font-normal text-zinc-500">· {STATUS_LABEL[a.status]}</span>
      </h1>

      {erro && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{erro}</p>}

      <section className="grid gap-2 rounded border p-4 text-sm sm:grid-cols-2">
        <p><span className="text-zinc-500">Data:</span> {date.split("-").reverse().join("/")}</p>
        <p><span className="text-zinc-500">Horário:</span> {localTime(a.startsAt)}–{localTime(a.endsAt)}</p>
        <p><span className="text-zinc-500">Profissional:</span> {a.professional.user.name}</p>
        <p><span className="text-zinc-500">Serviço:</span> {a.service.name} ({online ? "online" : "presencial"})</p>
        <p><span className="text-zinc-500">Telefone:</span> {a.patient.phoneE164 ? formatPhoneBR(a.patient.phoneE164) : "—"}</p>
        <p><Link href={`/pacientes/${a.patient.id}`} className="underline">Ver ficha do paciente</Link></p>
      </section>

      {online && (
        <section className="space-y-2 rounded border p-4 text-sm">
          <h2 className="font-medium">Videochamada</h2>
          {a.meetingUrl ? (
            <p>
              <a href={a.meetingUrl} target="_blank" rel="noopener noreferrer" className="break-all underline">{a.meetingUrl}</a>
            </p>
          ) : (
            <p className="text-amber-700">Sem link definido. Informe abaixo ou configure o link padrão do profissional.</p>
          )}
          <form action={setMeetingUrlAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={a.id} />
            <input name="meetingUrl" type="url" defaultValue={a.meetingUrl ?? ""} placeholder="https://…" className={`${input} w-80`} />
            <button className={btn}>Salvar link</button>
          </form>
        </section>
      )}

      <section className="space-y-2 rounded border p-4">
        <h2 className="font-medium">Status</h2>
        <div className="flex flex-wrap gap-2">
          {statuses.map((s) => (
            <form key={s} action={setStatusAction}>
              <input type="hidden" name="id" value={a.id} />
              <input type="hidden" name="status" value={s} />
              <button className={btn}>{s === "AGENDADA" ? "Voltar para agendada" : STATUS_LABEL[s]}</button>
            </form>
          ))}
        </div>
        <p className="text-xs text-zinc-500">Cancelar libera o horário na agenda.</p>
      </section>

      <section className="space-y-2 rounded border p-4">
        <h2 className="font-medium">Remarcar</h2>
        <form action={rescheduleAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={a.id} />
          <input type="date" name="date" defaultValue={date} required className={input} />
          <input type="time" name="time" defaultValue={localTime(a.startsAt)} required className={input} />
          <button className={btn}>Remarcar</button>
        </form>
        <p className="text-xs text-zinc-500">A duração é mantida. A alteração fica registrada na auditoria.</p>
      </section>
    </div>
  );
}
