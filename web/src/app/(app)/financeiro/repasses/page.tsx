import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { localDate } from "@/lib/agenda";
import { formatBRL, shareOf, shiftMonth, validMonth } from "@/lib/money";
import { closePayoutAction, payPayoutAction, setSharePercentAction } from "@/app/actions/finance2";
import { FinanceTabs } from "@/components/finance-tabs";

export const dynamic = "force-dynamic";

const btn = "rounded border px-2 py-1 text-xs";

export default async function PayoutsPage({ searchParams }: { searchParams: Promise<{ mes?: string; erro?: string }> }) {
  const user = await requireRole("ADMIN", "FINANCEIRO");
  const sp = await searchParams;
  const mes = sp.mes && validMonth(sp.mes) ? sp.mes : localDate(new Date()).slice(0, 7);

  const [professionals, payouts, grossRows] = await Promise.all([
    db.professional.findMany({ where: { clinicId: user.clinicId }, include: { user: { select: { name: true, active: true } } }, orderBy: { user: { name: "asc" } } }),
    db.payout.findMany({ where: { clinicId: user.clinicId, period: mes } }),
    db.charge.findMany({
      where: { clinicId: user.clinicId, status: "PAGA", competence: mes, appointmentId: { not: null } },
      select: { amountCents: true, appointment: { select: { professionalId: true } } },
    }),
  ]);
  const gross = new Map<string, number>();
  for (const c of grossRows) {
    const pid = c.appointment?.professionalId;
    if (pid) gross.set(pid, (gross.get(pid) ?? 0) + c.amountCents);
  }
  const payoutOf = new Map(payouts.map((p) => [p.professionalId, p]));

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl">Financeiro</h1>
      <FinanceTabs active="/financeiro/repasses" mes={mes} />
      {sp.erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}

      <div className="flex items-center gap-3 text-sm">
        <Link href={`/financeiro/repasses?mes=${shiftMonth(mes, -1)}`} className={btn}>←</Link>
        <strong className="min-w-16 text-center">{mes.split("-").reverse().join("/")}</strong>
        <Link href={`/financeiro/repasses?mes=${shiftMonth(mes, 1)}`} className={btn}>→</Link>
      </div>

      <p className="text-xs text-zinc-500">
        Repasse = percentual do profissional sobre o valor recebido no mês em cobranças ligadas a atendimentos dele. Receita de pacotes não é atribuída a profissionais.
        Fechar o repasse grava o valor; depois disso ele não muda.
      </p>

      <ul className="divide-y rounded border text-sm">
        {professionals.length === 0 && <li className="p-4 text-zinc-500">Nenhum profissional cadastrado.</li>}
        {professionals.map((p) => {
          const g = gross.get(p.id) ?? 0;
          const closed = payoutOf.get(p.id);
          const share = closed ? closed.shareCents : shareOf(g, p.sharePercent);
          return (
            <li key={p.id} className="space-y-2 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{p.user.name}{!p.user.active && <span className="ml-2 text-xs text-zinc-400">(inativo)</span>}</span>
                <form action={setSharePercentAction} className="flex items-center gap-1 text-xs">
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="mes" value={mes} />
                  <label>Repasse
                    <input name="percent" type="number" min={0} max={100} defaultValue={p.sharePercent} className="ml-1 w-16 rounded border px-2 py-1" />%
                  </label>
                  <button className={btn}>Salvar</button>
                </form>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-zinc-600">
                  Recebido: <strong>{formatBRL(closed ? closed.grossCents : g)}</strong> · Repasse: <strong className="text-emerald-700">{formatBRL(share)}</strong>
                </span>
                {closed ? (
                  closed.status === "PAGO" ? (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Pago em {closed.paidAt?.toLocaleDateString("pt-BR")}</span>
                  ) : (
                    <form action={payPayoutAction} className="flex items-center gap-2">
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Fechado · a pagar</span>
                      <input type="hidden" name="id" value={closed.id} />
                      <button className={btn}>Marcar como pago</button>
                    </form>
                  )
                ) : (
                  <form action={closePayoutAction}>
                    <input type="hidden" name="professionalId" value={p.id} />
                    <input type="hidden" name="mes" value={mes} />
                    <button className={btn} disabled={g === 0}>Fechar repasse do mês</button>
                  </form>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
