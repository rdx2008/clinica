import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { addDays, capacityMinutes, dayRange, localDate, pct, professionalColor } from "@/lib/agenda";
import { formatBRL, shiftMonth, validMonth } from "@/lib/money";

export const dynamic = "force-dynamic";

const btn = "rounded border px-2 py-1 text-xs";

function Bar({ value, max, color = "#0f6b5d" }: { value: number; max: number; color?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
      <div className="h-full rounded-full" style={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%`, background: color }} />
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireRole("ADMIN");
  const sp = await searchParams;
  const mes = sp.mes && validMonth(sp.mes) ? sp.mes : localDate(new Date()).slice(0, 7);
  const first = `${mes}-01`;
  const nextFirst = `${shiftMonth(mes, 1)}-01`;
  const start = dayRange(first)!.start;
  const end = dayRange(nextFirst)!.start;
  const clinicId = user.clinicId;

  const [appointments, professionals, newPatients, activePatients, paidCharges] = await Promise.all([
    db.appointment.findMany({
      where: { clinicId, startsAt: { gte: start, lt: end } },
      select: { id: true, status: true, startsAt: true, endsAt: true, professionalId: true, patientId: true, service: { select: { name: true } }, patient: { select: { fullName: true } } },
    }),
    db.professional.findMany({ where: { clinicId, user: { active: true } }, include: { user: { select: { name: true } }, availability: true }, orderBy: { user: { name: "asc" } } }),
    db.patient.findMany({ where: { clinicId, createdAt: { gte: start, lt: end } }, select: { source: true } }),
    db.patient.count({ where: { clinicId, status: "ATIVO" } }),
    db.charge.findMany({
      where: { clinicId, status: "PAGA", competence: mes },
      select: { amountCents: true, appointment: { select: { professionalId: true, service: { select: { name: true } } } } },
    }),
  ]);

  const count = (s: string) => appointments.filter((a) => a.status === s).length;
  const attended = count("COMPARECEU");
  const missed = count("FALTOU");
  const cancelled = count("CANCELADA");
  const scheduled = appointments.length;
  const done = attended + missed;
  const missRate = pct(missed, done);

  // por profissional
  const colorOf = new Map(professionals.map((p, i) => [p.id, professionalColor(p.color, i)]));
  const perProf = professionals.map((p) => {
    const mine = appointments.filter((a) => a.professionalId === p.id && a.status !== "CANCELADA");
    const bookedMin = mine.reduce((t, a) => t + (a.endsAt.getTime() - a.startsAt.getTime()) / 60000, 0);
    const cap = capacityMinutes(p.availability, first, nextFirst);
    const revenue = paidCharges.filter((c) => c.appointment?.professionalId === p.id).reduce((t, c) => t + c.amountCents, 0);
    return {
      id: p.id,
      name: p.user.name,
      sessions: mine.length,
      attended: mine.filter((a) => a.status === "COMPARECEU").length,
      missed: mine.filter((a) => a.status === "FALTOU").length,
      occupancy: pct(bookedMin, cap),
      revenue,
    };
  });
  const maxSessions = Math.max(1, ...perProf.map((p) => p.sessions));

  // por serviço
  const bySvc = new Map<string, number>();
  for (const a of appointments) if (a.status !== "CANCELADA") bySvc.set(a.service.name, (bySvc.get(a.service.name) ?? 0) + 1);
  const svcRows = [...bySvc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  // por dia do mês
  const perDay = new Map<string, number>();
  for (const a of appointments) if (a.status !== "CANCELADA") perDay.set(localDate(a.startsAt), (perDay.get(localDate(a.startsAt)) ?? 0) + 1);
  const days: string[] = [];
  for (let d = first; d < nextFirst; d = addDays(d, 1)) days.push(d);
  const maxDay = Math.max(1, ...days.map((d) => perDay.get(d) ?? 0));

  // pacientes
  const bySource = new Map<string, number>();
  for (const p of newPatients) bySource.set(p.source?.trim() || "Não informado", (bySource.get(p.source?.trim() || "Não informado") ?? 0) + 1);
  const sourceRows = [...bySource.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  // quem mais faltou
  const missBy = new Map<string, { name: string; n: number }>();
  for (const a of appointments) if (a.status === "FALTOU") missBy.set(a.patientId, { name: a.patient.fullName, n: (missBy.get(a.patientId)?.n ?? 0) + 1 });
  const topMiss = [...missBy.values()].sort((a, b) => b.n - a.n).slice(0, 5);

  const revenue = paidCharges.reduce((t, c) => t + c.amountCents, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl">Relatórios</h1>
          <p className="text-sm text-zinc-600">Visão do mês para acompanhar atendimento, faltas, ocupação e origem dos pacientes.</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/relatorios?mes=${shiftMonth(mes, -1)}`} className={btn}>←</Link>
          <strong className="min-w-16 text-center">{mes.split("-").reverse().join("/")}</strong>
          <Link href={`/relatorios?mes=${shiftMonth(mes, 1)}`} className={btn}>→</Link>
          <a href={`/relatorios/exportar?mes=${mes}`} className="ml-2 rounded border px-3 py-1.5 text-sm">Exportar atendimentos (CSV)</a>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Atendimentos agendados" value={String(scheduled)} hint={`${cancelled} cancelado(s)`} />
        <Stat label="Compareceram" value={String(attended)} />
        <Stat label="Faltas" value={String(missed)} hint={missRate === null ? undefined : `${missRate}% dos atendimentos realizados`} />
        <Stat label="Pacientes novos" value={String(newPatients.length)} hint={`${activePatients} ativos no total`} />
        <Stat label="Recebido no mês" value={formatBRL(revenue)} />
      </div>

      <section className="space-y-3 rounded border p-5">
        <h2>Atendimentos por dia</h2>
        <div className="flex h-28 items-end gap-[3px]">
          {days.map((d) => {
            const n = perDay.get(d) ?? 0;
            return (
              <div key={d} className="group relative flex flex-1 flex-col items-center justify-end" title={`${d.split("-").reverse().slice(0, 2).join("/")}: ${n}`}>
                <div className="w-full rounded-t bg-emerald-600/80 group-hover:bg-emerald-700" style={{ height: `${Math.max(n > 0 ? 6 : 1, (n / maxDay) * 100)}%`, opacity: n === 0 ? 0.25 : 1 }} />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] text-zinc-400"><span>dia 1</span><span>dia {days.length}</span></div>
      </section>

      <section className="space-y-3 rounded border p-5">
        <h2>Por profissional</h2>
        {perProf.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum profissional ativo.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-zinc-500">
                <tr><th className="py-2">Profissional</th><th>Atendimentos</th><th>Compareceu</th><th>Faltas</th><th>Ocupação</th><th className="text-right">Recebido</th></tr>
              </thead>
              <tbody className="divide-y">
                {perProf.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 pr-3 font-medium"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: colorOf.get(p.id) }} />{p.name}</td>
                    <td className="pr-3"><div className="flex items-center gap-2"><span className="w-6">{p.sessions}</span><div className="w-24"><Bar value={p.sessions} max={maxSessions} color={colorOf.get(p.id)} /></div></div></td>
                    <td>{p.attended}</td>
                    <td>{p.missed}</td>
                    <td>{p.occupancy === null ? <span className="text-zinc-400" title="Cadastre os horários de atendimento">—</span> : `${p.occupancy}%`}</td>
                    <td className="text-right">{formatBRL(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-zinc-500">Ocupação = horas agendadas ÷ horas de atendimento cadastradas para o profissional no mês.</p>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="space-y-3 rounded border p-5">
          <h2>Serviços mais realizados</h2>
          {svcRows.length === 0 && <p className="text-sm text-zinc-500">Sem dados no mês.</p>}
          <ul className="space-y-2 text-sm">
            {svcRows.map(([name, n]) => (
              <li key={name}><div className="flex justify-between"><span>{name}</span><strong>{n}</strong></div><Bar value={n} max={svcRows[0][1]} /></li>
            ))}
          </ul>
        </section>

        <section className="space-y-3 rounded border p-5">
          <h2>Origem dos pacientes novos</h2>
          {sourceRows.length === 0 && <p className="text-sm text-zinc-500">Nenhum paciente novo no mês.</p>}
          <ul className="space-y-2 text-sm">
            {sourceRows.map(([name, n]) => (
              <li key={name}><div className="flex justify-between"><span>{name}</span><strong>{n}</strong></div><Bar value={n} max={sourceRows[0][1]} color="#2563eb" /></li>
            ))}
          </ul>
        </section>
      </div>

      <section className="space-y-2 rounded border p-5">
        <h2>Pacientes com mais faltas no mês</h2>
        {topMiss.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhuma falta registrada.</p>
        ) : (
          <ul className="divide-y text-sm">
            {topMiss.map((m) => <li key={m.name} className="flex justify-between py-1.5"><span>{m.name}</span><strong>{m.n} falta(s)</strong></li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
