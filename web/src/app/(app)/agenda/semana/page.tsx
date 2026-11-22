import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import {
  addDays,
  dayRange,
  layoutLanes,
  localDate,
  localTime,
  minutesOfDay,
  nowPlus,
  professionalColor,
  STATUS_LABEL,
  weekDays,
} from "@/lib/agenda";

export const dynamic = "force-dynamic";

const HOUR_START = 7;
const HOUR_END = 21;
const ROW = 56; // px por hora
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
const WD = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

export default async function WeekPage({ searchParams }: { searchParams: Promise<{ date?: string; prof?: string }> }) {
  const user = await requireRole("ADMIN", "RECEPCAO", "PROFISSIONAL");
  const sp = await searchParams;
  const today = localDate(nowPlus(0));
  const date = dayRange(sp.date ?? "") ? (sp.date as string) : today;
  const days = weekDays(date);
  const start = dayRange(days[0])!.start;
  const end = dayRange(days[6])!.end;

  const professionals = await db.professional.findMany({
    where: { clinicId: user.clinicId, user: { active: true }, ...(user.role === "PROFISSIONAL" ? { userId: user.id } : {}) },
    include: { user: { select: { name: true } } },
    orderBy: { user: { name: "asc" } },
  });
  const colorOf = new Map(professionals.map((p, i) => [p.id, professionalColor(p.color, i)]));
  const all = user.role !== "PROFISSIONAL" && (sp.prof === "todos" || (!sp.prof && professionals.length > 1));
  const selected = all ? null : (professionals.find((p) => p.id === sp.prof) ?? professionals[0]);
  const ids = all ? professionals.map((p) => p.id) : selected ? [selected.id] : [];

  const [appointments, blocks] = await Promise.all([
    db.appointment.findMany({
      where: { professionalId: { in: ids }, startsAt: { gte: start, lt: end }, status: { not: "CANCELADA" } },
      orderBy: { startsAt: "asc" },
      include: { patient: { select: { fullName: true } }, service: { select: { name: true } } },
    }),
    db.block.findMany({ where: { professionalId: { in: ids }, startsAt: { lt: end }, endsAt: { gt: start } } }),
  ]);

  const profParam = all ? "todos" : (selected?.id ?? "");
  const nav = (d: string) => `/agenda/semana?date=${d}${profParam ? `&prof=${profParam}` : ""}`;
  const fmt = (d: string) => d.split("-").reverse().slice(0, 2).join("/");
  const nowMin = minutesOfDay(nowPlus(0));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl">Agenda</h1>
          <p className="text-sm text-zinc-600">
            Semana de {fmt(days[0])} a {fmt(days[6])}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-lg border bg-white text-sm shadow-sm">
            <span className="bg-emerald-700 px-3 py-1.5 font-medium text-white">Semana</span>
            <Link href={`/agenda?date=${date}${profParam && profParam !== "todos" ? `&prof=${profParam}` : ""}`} className="px-3 py-1.5 hover:bg-zinc-50">Dia</Link>
          </div>
          {user.role !== "PROFISSIONAL" && <Link href="/agenda/espera" className="rounded border px-3 py-1.5 text-sm">Lista de espera</Link>}
          <Link href={`/agenda/novo?date=${date}${selected ? `&prof=${selected.id}` : ""}`} className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white">
            Novo agendamento
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={nav(addDays(date, -7))} className="rounded border px-2.5 py-1">← Anterior</Link>
        <Link href={nav(today)} className="rounded border px-2.5 py-1">Hoje</Link>
        <Link href={nav(addDays(date, 7))} className="rounded border px-2.5 py-1">Próxima →</Link>
        {professionals.length > 1 && user.role !== "PROFISSIONAL" && (
          <form className="ml-auto flex items-center gap-2">
            <input type="hidden" name="date" value={date} />
            <select name="prof" defaultValue={profParam} className="rounded border px-2 py-1.5 text-sm">
              <option value="todos">Todos os profissionais</option>
              {professionals.map((p) => <option key={p.id} value={p.id}>{p.user.name}</option>)}
            </select>
            <button className="rounded border px-2.5 py-1.5 text-xs">Ver</button>
          </form>
        )}
      </div>

      {all && (
        <ul className="flex flex-wrap gap-3 text-xs text-zinc-600">
          {professionals.map((p) => (
            <li key={p.id} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorOf.get(p.id) }} />
              {p.user.name}
            </li>
          ))}
        </ul>
      )}

      {professionals.length === 0 ? (
        <p className="rounded border p-4 text-sm text-zinc-600">Nenhum profissional ativo. Crie um usuário com perfil Profissional em Usuários.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
          <div className="min-w-[860px]">
            {/* cabeçalho dos dias */}
            <div className="grid grid-cols-[52px_repeat(7,1fr)] border-b bg-zinc-50 text-center text-xs">
              <div />
              {days.map((d, i) => (
                <Link
                  key={d}
                  href={`/agenda?date=${d}${profParam && profParam !== "todos" ? `&prof=${profParam}` : ""}`}
                  className={`py-2 ${d === today ? "font-semibold text-emerald-700" : "text-zinc-600"} hover:bg-zinc-100`}
                >
                  <span className="uppercase tracking-wide">{WD[i]}</span>
                  <span className={`mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm ${d === today ? "bg-emerald-700 text-white" : ""}`}>
                    {Number(d.slice(8))}
                  </span>
                </Link>
              ))}
            </div>

            <div className="grid grid-cols-[52px_repeat(7,1fr)]">
              {/* coluna de horas */}
              <div>
                {HOURS.map((h) => (
                  <div key={h} style={{ height: ROW }} className="pr-2 text-right text-[11px] text-zinc-400">
                    <span className="relative -top-2">{String(h).padStart(2, "0")}:00</span>
                  </div>
                ))}
              </div>

              {days.map((d) => {
                const dayAppts = appointments.filter((a) => localDate(a.startsAt) === d);
                const dayBlocks = blocks.filter((b) => localDate(b.startsAt) === d);
                const lanes = layoutLanes(dayAppts.map((a) => ({ id: a.id, start: minutesOfDay(a.startsAt), end: minutesOfDay(a.endsAt) || 24 * 60 })));
                return (
                  <div key={d} className={`relative border-l ${d === today ? "bg-emerald-50/40" : ""}`} style={{ height: ROW * HOURS.length }}>
                    {/* linhas e células clicáveis (novo agendamento no horário) */}
                    {HOURS.map((h) => (
                      <Link
                        key={h}
                        aria-label={`Agendar ${fmt(d)} às ${h}:00`}
                        href={`/agenda/novo?date=${d}&time=${String(h).padStart(2, "0")}:00${selected ? `&prof=${selected.id}` : ""}`}
                        style={{ height: ROW }}
                        className="block border-t border-zinc-100 hover:bg-emerald-50"
                      />
                    ))}

                    {dayBlocks.map((b) => {
                      const top = Math.max(0, ((minutesOfDay(b.startsAt) - HOUR_START * 60) / 60) * ROW);
                      const h = ((minutesOfDay(b.endsAt) || 24 * 60) - minutesOfDay(b.startsAt)) / 60 * ROW;
                      return (
                        <div
                          key={b.id}
                          title={b.reason ?? "Bloqueado"}
                          className="pointer-events-none absolute inset-x-0.5 rounded-md bg-zinc-200/70 px-1.5 py-0.5 text-[10px] text-zinc-500"
                          style={{ top, height: Math.max(h, 18), backgroundImage: "repeating-linear-gradient(135deg, transparent 0 6px, rgb(0 0 0 / 0.05) 6px 12px)" }}
                        >
                          {b.reason ?? "Bloqueado"}
                        </div>
                      );
                    })}

                    {dayAppts.map((a) => {
                      const sMin = minutesOfDay(a.startsAt);
                      const eMin = minutesOfDay(a.endsAt) || 24 * 60;
                      const top = ((sMin - HOUR_START * 60) / 60) * ROW;
                      const height = Math.max(((eMin - sMin) / 60) * ROW - 2, 22);
                      if (top + height < 0 || top > ROW * HOURS.length) return null;
                      const l = lanes.get(a.id) ?? { lane: 0, lanes: 1 };
                      const color = colorOf.get(a.professionalId) ?? "#0f6b5d";
                      const faltou = a.status === "FALTOU";
                      return (
                        <Link
                          key={a.id}
                          href={`/agenda/${a.id}`}
                          title={`${a.patient.fullName} · ${a.service.name} · ${STATUS_LABEL[a.status]}`}
                          className="absolute overflow-hidden rounded-md px-1.5 py-0.5 text-[11px] leading-tight shadow-sm transition hover:z-10 hover:shadow-md"
                          style={{
                            top: Math.max(top, 0),
                            height,
                            left: `calc(${(l.lane / l.lanes) * 100}% + 2px)`,
                            width: `calc(${100 / l.lanes}% - 4px)`,
                            background: `${color}22`,
                            borderLeft: `3px solid ${color}`,
                            color: "#1d1c19",
                            opacity: faltou ? 0.6 : 1,
                          }}
                        >
                          <span className="font-semibold">{localTime(a.startsAt)}</span> {a.patient.fullName}
                          {a.status === "CONFIRMADA" && <span className="ml-1 text-emerald-700">✓</span>}
                          {a.status === "COMPARECEU" && <span className="ml-1 text-blue-700">●</span>}
                          {faltou && <span className="ml-1 text-amber-700">falta</span>}
                        </Link>
                      );
                    })}

                    {d === today && nowMin >= HOUR_START * 60 && nowMin < HOUR_END * 60 && (
                      <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: ((nowMin - HOUR_START * 60) / 60) * ROW }}>
                        <span className="-ml-1 h-2 w-2 rounded-full bg-red-500" />
                        <span className="h-px flex-1 bg-red-500" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
