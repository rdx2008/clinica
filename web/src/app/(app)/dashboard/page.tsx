import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { addDays, dayRange, localDate, localTime, nowPlus, STATUS_LABEL } from "@/lib/agenda";
import { formatBRL } from "@/lib/money";

export const dynamic = "force-dynamic";

function Card({ title, value, href, hint }: { title: string; value: string | number; href?: string; hint?: string }) {
  const body = (
    <div className="rounded border p-4">
      <p className="text-xs text-zinc-500">{title}</p>
      <p className="text-2xl font-semibold">{value}</p>
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function DashboardPage() {
  const user = await requireUser();
  const today = localDate(nowPlus(0));
  const range = dayRange(today)!;
  const clinicId = user.clinicId;
  const isProf = user.role === "PROFISSIONAL";
  const sees = (...roles: string[]) => roles.includes(user.role);

  const prof = isProf ? await db.professional.findUnique({ where: { userId: user.id }, select: { id: true } }) : null;
  const apptWhere = {
    clinicId,
    startsAt: { gte: range.start, lt: range.end },
    status: { not: "CANCELADA" as const },
    ...(isProf ? { professionalId: prof?.id ?? "__none__" } : {}),
  };

  const [todayAppts, unanswered, overdue, patients] = await Promise.all([
    sees("ADMIN", "RECEPCAO", "PROFISSIONAL")
      ? db.appointment.findMany({
          where: apptWhere,
          orderBy: { startsAt: "asc" },
          take: 12,
          include: { patient: { select: { fullName: true } }, professional: { include: { user: { select: { name: true } } } } },
        })
      : [],
    sees("ADMIN", "RECEPCAO")
      ? db.waConversation.count({ where: { clinicId, messages: { some: {} }, NOT: { messages: { some: { direction: "SAIDA", createdAt: { gte: nowPlus(-24 * 3600_000) } } } }, windowExpiresAt: { gt: nowPlus(0) } } })
      : 0,
    sees("ADMIN", "FINANCEIRO", "RECEPCAO")
      ? db.charge.aggregate({ where: { clinicId, status: "PENDENTE", dueDate: { lt: new Date(`${today}T00:00:00.000Z`) } }, _sum: { amountCents: true }, _count: true })
      : null,
    sees("ADMIN", "RECEPCAO") ? db.patient.count({ where: { clinicId, status: "ATIVO" } }) : 0,
  ]);

  // Atendimentos que já passaram e continuam sem desfecho (compareceu/faltou/cancelada).
  const stale = sees("ADMIN", "RECEPCAO", "PROFISSIONAL")
    ? await db.appointment.findMany({
        where: {
          clinicId,
          status: { in: ["AGENDADA", "CONFIRMADA"] },
          startsAt: { lt: nowPlus(-3600_000), gt: nowPlus(-30 * 86400_000) },
          ...(isProf ? { professionalId: prof?.id ?? "__none__" } : {}),
        },
        orderBy: { startsAt: "desc" },
        take: 8,
        include: { patient: { select: { fullName: true } } },
      })
    : [];

  // Aniversariantes de hoje e dos próximos 7 dias.
  let birthdays: { id: string; name: string; label: string }[] = [];
  if (sees("ADMIN", "RECEPCAO")) {
    const people = await db.patient.findMany({ where: { clinicId, status: "ATIVO", birthDate: { not: null } }, select: { id: true, fullName: true, birthDate: true }, take: 5000 });
    const keys = Array.from({ length: 8 }, (_, i) => addDays(today, i));
    birthdays = people
      .flatMap((p) => {
        const md = p.birthDate!.toISOString().slice(5, 10);
        const i = keys.findIndex((k) => k.slice(5) === md);
        return i < 0 ? [] : [{ id: p.id, name: p.fullName, i, label: i === 0 ? "hoje" : i === 1 ? "amanhã" : keys[i].split("-").reverse().slice(0, 2).join("/") }];
      })
      .sort((a, b) => a.i - b.i)
      .slice(0, 8);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-xl font-semibold">Olá, {user.name.split(" ")[0]}</h1>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {sees("ADMIN", "RECEPCAO", "PROFISSIONAL") && <Card title="Atendimentos hoje" value={todayAppts.length} href={`/agenda?date=${today}`} />}
        {sees("ADMIN", "RECEPCAO") && <Card title="WhatsApp com janela aberta" value={unanswered} href="/whatsapp" hint="sem resposta nas últimas 24 h" />}
        {overdue && <Card title="Cobranças vencidas" value={formatBRL(overdue._sum.amountCents ?? 0)} href="/financeiro" hint={`${overdue._count} cobrança(s)`} />}
        {sees("ADMIN", "RECEPCAO") && <Card title="Pacientes ativos" value={patients} href="/pacientes" />}
      </div>

      {stale.length > 0 && (
        <section className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-amber-900">Atendimentos sem desfecho ({stale.length})</h2>
          <p className="text-xs text-amber-800">Já aconteceram, mas ainda estão como agendados. Registre se o paciente compareceu, faltou ou cancelou.</p>
          <ul className="divide-y divide-amber-200 text-sm">
            {stale.map((a) => (
              <li key={a.id}>
                <Link href={`/agenda/${a.id}`} className="flex justify-between gap-2 py-1.5 hover:underline">
                  <span>{a.patient.fullName}</span>
                  <span className="text-xs text-amber-800">{localDate(a.startsAt).split("-").reverse().join("/")} · {localTime(a.startsAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sees("ADMIN", "RECEPCAO", "PROFISSIONAL") && (
        <section className="space-y-2">
          <h2 className="font-medium">Agenda de hoje</h2>
          <ul className="divide-y rounded border text-sm">
            {todayAppts.length === 0 && <li className="p-3 text-zinc-500">Nenhum atendimento hoje.</li>}
            {todayAppts.map((a) => (
              <li key={a.id}>
                <Link href={`/agenda/${a.id}`} className="flex items-center justify-between gap-2 p-3 hover:bg-zinc-50">
                  <span>
                    <strong>{localTime(a.startsAt)}</strong> · {a.patient.fullName}
                    {!isProf && <span className="text-xs text-zinc-500"> · {a.professional.user.name}</span>}
                  </span>
                  <span className="text-xs text-zinc-500">{STATUS_LABEL[a.status]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {birthdays.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Aniversariantes</h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {birthdays.map((b) => (
              <li key={b.id}>
                <Link href={`/pacientes/${b.id}`} className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 shadow-sm hover:bg-zinc-50">
                  <span aria-hidden="true">🎂</span> {b.name.split(" ")[0]} <span className="text-xs text-zinc-500">{b.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
