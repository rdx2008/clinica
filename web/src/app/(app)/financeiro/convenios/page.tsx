import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { localDate } from "@/lib/agenda";
import { formatBRL } from "@/lib/money";
import { createInsurerAction } from "@/app/actions/insurance";
import { FinanceTabs } from "@/components/finance-tabs";

export const dynamic = "force-dynamic";

const input = "rounded border bg-white px-3 py-2 text-sm";

export default async function InsurersPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const user = await requireRole("ADMIN", "FINANCEIRO");
  const sp = await searchParams;
  const today = new Date(`${localDate(new Date())}T00:00:00.000Z`);

  const [insurers, open] = await Promise.all([
    db.insurer.findMany({ where: { clinicId: user.clinicId }, orderBy: [{ active: "desc" }, { name: "asc" }], include: { _count: { select: { plans: true } } } }),
    db.insuranceEntry.findMany({ where: { clinicId: user.clinicId, status: "A_FATURAR" }, select: { insurerId: true, amountCents: true, expectedDate: true } }),
  ]);
  const toReceive = new Map<string, { total: number; overdue: number; count: number }>();
  for (const e of open) {
    const row = toReceive.get(e.insurerId) ?? { total: 0, overdue: 0, count: 0 };
    row.total += e.amountCents;
    row.count += 1;
    if (e.expectedDate < today) row.overdue += e.amountCents;
    toReceive.set(e.insurerId, row);
  }
  const totalOpen = open.reduce((t, e) => t + e.amountCents, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl">Financeiro</h1>
      <FinanceTabs active="/financeiro/convenios" />
      {sp.erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}

      <p className="text-sm text-zinc-600">
        Convênios com a tabela de valores por serviço. Ao marcar o atendimento como <strong>Compareceu</strong>, o valor entra aqui como a receber.
        O repasse do profissional considera o que o convênio efetivamente pagou.
      </p>

      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-3 shadow-sm"><p className="text-xs text-zinc-500">A receber de convênios</p><p className="text-lg font-semibold">{formatBRL(totalOpen)}</p></div>
        <div className="rounded-xl border bg-white p-3 shadow-sm"><p className="text-xs text-zinc-500">Atendimentos em aberto</p><p className="text-lg font-semibold">{open.length}</p></div>
        <div className="rounded-xl border bg-white p-3 shadow-sm"><p className="text-xs text-zinc-500">Passou da previsão</p><p className="text-lg font-semibold text-red-700">{formatBRL([...toReceive.values()].reduce((t, r) => t + r.overdue, 0))}</p></div>
      </div>

      <ul className="divide-y rounded border text-sm">
        {insurers.length === 0 && <li className="p-4 text-zinc-500">Nenhum convênio cadastrado ainda.</li>}
        {insurers.map((i) => {
          const r = toReceive.get(i.id);
          return (
            <li key={i.id}>
              <Link href={`/financeiro/convenios/${i.id}`} className="flex flex-wrap items-center justify-between gap-2 p-3 hover:bg-zinc-50">
                <span>
                  <span className="font-medium">{i.name}</span>
                  {!i.active && <span className="ml-2 rounded bg-zinc-200 px-2 py-0.5 text-xs">inativo</span>}
                  <span className="block text-xs text-zinc-500">paga em ~{i.paymentDays} dias · {i._count.plans} carteirinha(s){i.sharePercent !== null ? ` · repasse ${i.sharePercent}%` : ""}</span>
                </span>
                <span className="text-right">
                  <span className="block font-medium">{formatBRL(r?.total ?? 0)} <span className="text-xs font-normal text-zinc-500">a receber</span></span>
                  {r && r.overdue > 0 && <span className="text-xs text-red-700">{formatBRL(r.overdue)} além da previsão</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <form action={createInsurerAction} className="space-y-3 rounded border bg-white p-4">
        <h2>Novo convênio</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">Nome<input name="name" required placeholder="Ex.: Unimed" className={`${input} mt-1 w-full`} /></label>
          <label className="block text-sm">CNPJ (opcional)<input name="cnpj" inputMode="numeric" className={`${input} mt-1 w-full`} /></label>
          <label className="block text-sm">Prazo de pagamento (dias após o atendimento)<input name="paymentDays" type="number" min={0} max={365} defaultValue={30} className={`${input} mt-1 w-full`} /></label>
          <label className="block text-sm">Repasse do profissional neste convênio (%)<input name="sharePercent" type="number" min={0} max={100} placeholder="vazio = usa o do profissional" className={`${input} mt-1 w-full`} /></label>
        </div>
        <button className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">Cadastrar convênio</button>
      </form>
    </div>
  );
}
