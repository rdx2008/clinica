import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { localDate } from "@/lib/agenda";
import { formatBRL, shiftMonth, validMonth } from "@/lib/money";
import { FinanceTabs } from "@/components/finance-tabs";

export const dynamic = "force-dynamic";

const btn = "rounded border px-2 py-1 text-xs";

type Row = { name: string; count: number; billed: number; received: number; toReceive: number; overdue: number; glossOpen: number; glossLost: number };

// Faturamento, recebimento e glosa por convênio na competência (mês do atendimento) e caixa do mês.
export default async function InsuranceReportPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireRole("ADMIN", "FINANCEIRO");
  const sp = await searchParams;
  const today = localDate(new Date());
  const mes = sp.mes && validMonth(sp.mes) ? sp.mes : today.slice(0, 7);
  const todayDate = new Date(`${today}T00:00:00.000Z`);

  const [insurers, entries, cash] = await Promise.all([
    db.insurer.findMany({ where: { clinicId: user.clinicId }, select: { id: true, name: true } }),
    db.insuranceEntry.findMany({ where: { clinicId: user.clinicId, competence: mes, status: { not: "CANCELADO" } }, include: { payments: { select: { amountCents: true } } } }),
    db.insurancePayment.groupBy({ by: ["insurerId"], where: { clinicId: user.clinicId, paymentMonth: mes }, _sum: { amountCents: true } }),
  ]);
  const name = new Map(insurers.map((i) => [i.id, i.name]));
  const byInsurer = new Map<string, Row>();
  const reasons = new Map<string, { count: number; cents: number }>();

  for (const e of entries) {
    const r = byInsurer.get(e.insurerId) ?? { name: name.get(e.insurerId) ?? "Convênio", count: 0, billed: 0, received: 0, toReceive: 0, overdue: 0, glossOpen: 0, glossLost: 0 };
    const paid = e.payments.reduce((t, p) => t + p.amountCents, 0);
    r.count += 1;
    r.billed += e.amountCents;
    r.received += paid;
    if (e.status === "A_FATURAR" || e.status === "FATURADO") {
      r.toReceive += e.amountCents;
      if (e.expectedDate < todayDate) r.overdue += e.amountCents;
    } else if (e.status === "GLOSADO" || e.status === "RECURSO") {
      r.glossOpen += e.amountCents - paid;
    } else if (e.status === "GLOSA_ACEITA") {
      r.glossLost += e.amountCents - paid;
    }
    if (e.status === "GLOSADO" || e.status === "RECURSO" || e.status === "GLOSA_ACEITA") {
      const key = e.glossReason ?? "Sem motivo informado";
      const g = reasons.get(key) ?? { count: 0, cents: 0 };
      g.count += 1;
      g.cents += e.amountCents - paid;
      reasons.set(key, g);
    }
    byInsurer.set(e.insurerId, r);
  }
  const rows = [...byInsurer.values()].sort((a, b) => b.billed - a.billed);
  const total = rows.reduce((t, r) => ({ billed: t.billed + r.billed, received: t.received + r.received, toReceive: t.toReceive + r.toReceive, overdue: t.overdue + r.overdue, glossOpen: t.glossOpen + r.glossOpen, glossLost: t.glossLost + r.glossLost }), { billed: 0, received: 0, toReceive: 0, overdue: 0, glossOpen: 0, glossLost: 0 });
  const glossPct = total.billed ? Math.round(((total.glossOpen + total.glossLost) / total.billed) * 100) : 0;
  const cashTotal = cash.reduce((t, c) => t + (c._sum.amountCents ?? 0), 0);
  const topReasons = [...reasons.entries()].sort((a, b) => b[1].cents - a[1].cents).slice(0, 8);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link href="/financeiro/convenios" className="text-xs text-zinc-500 underline">← Convênios</Link>
      <h1 className="text-2xl">Relatório de convênios</h1>
      <FinanceTabs active="/financeiro/convenios" />
      <div className="flex items-center gap-3 text-sm">
        <Link href={`/financeiro/convenios/relatorio?mes=${shiftMonth(mes, -1)}`} className={btn}>←</Link>
        <strong className="min-w-16 text-center">{mes.split("-").reverse().join("/")}</strong>
        <Link href={`/financeiro/convenios/relatorio?mes=${shiftMonth(mes, 1)}`} className={btn}>→</Link>
        <span className="text-xs text-zinc-500">competência = mês do atendimento</span>
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border bg-white p-3 shadow-sm"><p className="text-xs text-zinc-500">Faturado</p><p className="text-lg font-semibold">{formatBRL(total.billed)}</p></div>
        <div className="rounded-xl border bg-white p-3 shadow-sm"><p className="text-xs text-zinc-500">Recebido</p><p className="text-lg font-semibold text-emerald-700">{formatBRL(total.received)}</p></div>
        <div className="rounded-xl border bg-white p-3 shadow-sm"><p className="text-xs text-zinc-500">A receber</p><p className="text-lg font-semibold">{formatBRL(total.toReceive)}</p></div>
        <div className="rounded-xl border bg-white p-3 shadow-sm"><p className="text-xs text-zinc-500">Passou da previsão</p><p className="text-lg font-semibold text-red-700">{formatBRL(total.overdue)}</p></div>
        <div className="rounded-xl border bg-white p-3 shadow-sm"><p className="text-xs text-zinc-500">Glosa em aberto</p><p className="text-lg font-semibold text-red-700">{formatBRL(total.glossOpen)}</p></div>
        <div className="rounded-xl border bg-white p-3 shadow-sm"><p className="text-xs text-zinc-500">Taxa de glosa</p><p className="text-lg font-semibold">{glossPct}%</p></div>
      </div>

      <section className="space-y-2">
        <h2>Por convênio</h2>
        <div className="overflow-x-auto rounded border bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-zinc-500">
                <th className="p-2">Convênio</th><th className="p-2 text-right">Atend.</th><th className="p-2 text-right">Faturado</th><th className="p-2 text-right">Recebido</th>
                <th className="p-2 text-right">A receber</th><th className="p-2 text-right">Glosa aberta</th><th className="p-2 text-right">Glosa aceita</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} className="p-4 text-zinc-500">Nenhum atendimento de convênio nesta competência.</td></tr>}
              {rows.map((r) => (
                <tr key={r.name} className="border-b last:border-0">
                  <td className="p-2 font-medium">{r.name}</td><td className="p-2 text-right">{r.count}</td><td className="p-2 text-right">{formatBRL(r.billed)}</td>
                  <td className="p-2 text-right text-emerald-700">{formatBRL(r.received)}</td>
                  <td className="p-2 text-right">{formatBRL(r.toReceive)}{r.overdue > 0 && <span className="block text-xs text-red-700">{formatBRL(r.overdue)} vencido</span>}</td>
                  <td className="p-2 text-right text-red-700">{formatBRL(r.glossOpen)}</td><td className="p-2 text-right">{formatBRL(r.glossLost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="space-y-2">
          <h2>Principais motivos de glosa</h2>
          <ul className="divide-y rounded border bg-white text-sm">
            {topReasons.length === 0 && <li className="p-3 text-zinc-500">Nenhuma glosa nesta competência.</li>}
            {topReasons.map(([reason, g]) => (
              <li key={reason} className="flex items-center justify-between gap-2 p-3"><span>{reason} <span className="text-xs text-zinc-500">({g.count})</span></span><span className="font-medium text-red-700">{formatBRL(g.cents)}</span></li>
            ))}
          </ul>
        </section>
        <section className="space-y-2">
          <h2>Caixa do mês (por data de recebimento)</h2>
          <ul className="divide-y rounded border bg-white text-sm">
            {cash.length === 0 && <li className="p-3 text-zinc-500">Nenhum recebimento de convênio neste mês.</li>}
            {cash.map((c) => (
              <li key={c.insurerId} className="flex items-center justify-between gap-2 p-3"><span>{name.get(c.insurerId) ?? "Convênio"}</span><span className="font-medium">{formatBRL(c._sum.amountCents ?? 0)}</span></li>
            ))}
            {cash.length > 0 && <li className="flex items-center justify-between gap-2 p-3 font-semibold"><span>Total</span><span>{formatBRL(cashTotal)}</span></li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
