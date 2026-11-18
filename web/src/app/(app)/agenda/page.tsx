import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { addDays, dayRange, localDate, localTime, STATUS_LABEL, weekdayLabel } from "@/lib/agenda";
import { addBlockAction, removeBlockAction, setDefaultMeetingUrlAction } from "@/app/actions/agenda";

export const dynamic = "force-dynamic";

const input = "rounded border px-2 py-1 text-sm";
const btn = "rounded border px-2 py-1 text-xs";

const STATUS_STYLE: Record<string, string> = {
  AGENDADA: "bg-zinc-100 text-zinc-700",
  CONFIRMADA: "bg-emerald-100 text-emerald-800",
  COMPARECEU: "bg-blue-100 text-blue-800",
  FALTOU: "bg-amber-100 text-amber-800",
  CANCELADA: "bg-red-100 text-red-700 line-through",
  REMARCADA: "bg-zinc-100 text-zinc-500",
};

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; prof?: string; erro?: string }>;
}) {
  const user = await requireRole("ADMIN", "RECEPCAO", "PROFISSIONAL");
  const sp = await searchParams;
  const date = dayRange(sp.date ?? "") ? (sp.date as string) : localDate(new Date());
  const range = dayRange(date)!;

  const professionals = await db.professional.findMany({
    where: { clinicId: user.clinicId, ...(user.role === "PROFISSIONAL" ? { userId: user.id } : {}) },
    include: { user: { select: { name: true, active: true } } },
    orderBy: { user: { name: "asc" } },
  });
  const selected = professionals.find((p) => p.id === sp.prof) ?? professionals[0];

  const [appointments, blocks, serviceCount] = selected
    ? await Promise.all([
        db.appointment.findMany({
          where: { professionalId: selected.id, startsAt: { gte: range.start, lt: range.end } },
          orderBy: { startsAt: "asc" },
          include: { patient: { select: { id: true, fullName: true } }, service: { select: { name: true, modality: true } } },
        }),
        db.block.findMany({
          where: { professionalId: selected.id, startsAt: { lt: range.end }, endsAt: { gt: range.start } },
          orderBy: { startsAt: "asc" },
        }),
        db.service.count({ where: { clinicId: user.clinicId } }),
      ])
    : [[], [], 0];

  const q = (d: string) => `/agenda?date=${d}${selected ? `&prof=${selected.id}` : ""}`;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Agenda</h1>
        {selected && serviceCount > 0 && (
          <Link href={`/agenda/novo?date=${date}&prof=${selected.id}`} className="rounded bg-emerald-700 px-3 py-2 text-sm text-white">
            Novo agendamento
          </Link>
        )}
      </div>

      {sp.erro && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}

      {professionals.length === 0 && (
        <p className="rounded border p-4 text-sm text-zinc-600">
          Nenhum profissional cadastrado. Crie um usuário com perfil Profissional em Usuários.
        </p>
      )}
      {selected && serviceCount === 0 && (
        <p className="rounded border p-4 text-sm text-zinc-600">
          Cadastre ao menos um serviço (tipo de atendimento) em{" "}
          {user.role === "ADMIN" ? <Link href="/servicos" className="underline">Serviços</Link> : "Serviços (peça ao administrador)"} para agendar.
        </p>
      )}

      {selected && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link href={q(addDays(date, -1))} className={btn}>← Dia anterior</Link>
            <Link href={q(localDate(new Date()))} className={btn}>Hoje</Link>
            <Link href={q(addDays(date, 1))} className={btn}>Próximo dia →</Link>
            {professionals.length > 1 && (
              <form className="flex items-center gap-2">
                <input type="hidden" name="date" value={date} />
                <select name="prof" defaultValue={selected.id} className={input}>
                  {professionals.map((p) => (
                    <option key={p.id} value={p.id}>{p.user.name}</option>
                  ))}
                </select>
                <button className={btn}>Ver</button>
              </form>
            )}
          </div>

          <h2 className="font-medium capitalize">{weekdayLabel(date)} · {selected.user.name}</h2>

          {appointments.length === 0 && blocks.length === 0 && <p className="text-sm text-zinc-500">Nada agendado neste dia.</p>}

          <ul className="space-y-2">
            {appointments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm">
                <div>
                  <p className="font-medium">
                    {localTime(a.startsAt)}–{localTime(a.endsAt)} · {a.patient.fullName}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {a.service.name} · {a.service.modality === "ONLINE" ? "online" : "presencial"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[a.status]}`}>{STATUS_LABEL[a.status]}</span>
                  <Link href={`/agenda/${a.id}`} className={btn}>Abrir</Link>
                </div>
              </li>
            ))}
            {blocks.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2 rounded border border-dashed bg-zinc-50 p-3 text-sm">
                <span>
                  {localTime(b.startsAt)}–{localTime(b.endsAt)} · Bloqueado{b.reason ? ` (${b.reason})` : ""}
                </span>
                <form action={removeBlockAction}>
                  <input type="hidden" name="id" value={b.id} />
                  <button className={btn}>Remover</button>
                </form>
              </li>
            ))}
          </ul>

          <p className="text-sm">
            <Link href={`/agenda/disponibilidade?prof=${selected.id}`} className="underline">Horários de atendimento de {selected.user.name}</Link>
          </p>

          <details className="rounded border p-3 text-sm">
            <summary className="cursor-pointer font-medium">Bloquear horário</summary>
            <form action={addBlockAction} className="mt-2 flex flex-wrap items-center gap-2">
              <input type="hidden" name="professionalId" value={selected.id} />
              <input type="date" name="date" defaultValue={date} required className={input} />
              <input type="time" name="startTime" required className={input} />
              <input type="time" name="endTime" required className={input} />
              <input name="reason" placeholder="Motivo (opcional)" className={input} />
              <button className={btn}>Bloquear</button>
            </form>
          </details>

          {user.role === "PROFISSIONAL" && (
            <details className="rounded border p-3 text-sm">
              <summary className="cursor-pointer font-medium">Meu link de atendimento online</summary>
              <form action={setDefaultMeetingUrlAction} className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  name="defaultMeetingUrl"
                  type="url"
                  defaultValue={selected.defaultMeetingUrl ?? ""}
                  placeholder="https://meet.google.com/..."
                  className={`${input} w-80`}
                />
                <button className={btn}>Salvar</button>
              </form>
              <p className="mt-1 text-xs text-zinc-500">Usado automaticamente nos atendimentos online. Pode ser trocado em cada sessão.</p>
            </details>
          )}
        </>
      )}
    </div>
  );
}
