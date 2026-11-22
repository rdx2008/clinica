import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { localDate } from "@/lib/agenda";
import { EXPENSE_CATEGORIES, formatBRL, shiftMonth, validMonth } from "@/lib/money";
import { createExpenseAction, deleteExpenseAction, toggleExpensePaidAction } from "@/app/actions/finance2";
import { FinanceTabs } from "@/components/finance-tabs";

export const dynamic = "force-dynamic";

const input = "w-full rounded border px-3 py-2 text-sm";
const btn = "rounded border px-2 py-1 text-xs";

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ mes?: string; erro?: string }> }) {
  const user = await requireRole("ADMIN", "FINANCEIRO");
  const sp = await searchParams;
  const today = localDate(new Date());
  const mes = sp.mes && validMonth(sp.mes) ? sp.mes : today.slice(0, 7);

  const expenses = await db.expense.findMany({
    where: { clinicId: user.clinicId, date: { gte: new Date(`${mes}-01T00:00:00.000Z`), lt: new Date(`${shiftMonth(mes, 1)}-01T00:00:00.000Z`) } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  const total = expenses.reduce((t, e) => t + e.amountCents, 0);
  const byCat = new Map<string, number>();
  for (const e of expenses) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amountCents);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl">Financeiro</h1>
      <FinanceTabs active="/financeiro/despesas" mes={mes} />
      {sp.erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}

      <div className="flex items-center gap-3 text-sm">
        <Link href={`/financeiro/despesas?mes=${shiftMonth(mes, -1)}`} className={btn}>←</Link>
        <strong className="min-w-16 text-center">{mes.split("-").reverse().join("/")}</strong>
        <Link href={`/financeiro/despesas?mes=${shiftMonth(mes, 1)}`} className={btn}>→</Link>
        <span className="ml-3 text-zinc-600">Total do mês: <strong>{formatBRL(total)}</strong></span>
      </div>

      {byCat.size > 0 && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
          {[...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => <span key={c}>{c}: <strong>{formatBRL(v)}</strong></span>)}
        </p>
      )}

      <ul className="divide-y rounded border text-sm">
        {expenses.length === 0 && <li className="p-4 text-zinc-500">Nenhuma despesa neste mês.</li>}
        {expenses.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div>
              <p className="font-medium">{e.description}</p>
              <p className="text-xs text-zinc-500">{e.category} · {e.date.toISOString().slice(0, 10).split("-").reverse().join("/")}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{formatBRL(e.amountCents)}</span>
              <form action={toggleExpensePaidAction}>
                <input type="hidden" name="id" value={e.id} />
                <button className={`${btn} ${e.paidAt ? "bg-emerald-50" : ""}`}>{e.paidAt ? "Paga ✓" : "Marcar paga"}</button>
              </form>
              <form action={deleteExpenseAction}>
                <input type="hidden" name="id" value={e.id} />
                <button className={btn}>Remover</button>
              </form>
            </div>
          </li>
        ))}
      </ul>

      <section className="space-y-3 rounded border p-4">
        <h2>Nova despesa</h2>
        <form action={createExpenseAction} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">Descrição
            <input name="description" required className={input} />
          </label>
          <label className="text-sm">Categoria
            <select name="category" defaultValue="Outros" className={input}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="text-sm">Valor (R$)
            <input name="amount" required inputMode="decimal" placeholder="1.200,00" className={input} />
          </label>
          <label className="text-sm">Data
            <input name="date" type="date" required defaultValue={`${mes}-${today.startsWith(mes) ? today.slice(8) : "01"}`} className={input} />
          </label>
          <label className="flex items-center gap-2 pt-6 text-sm">
            <input type="checkbox" name="paid" /> Já foi paga
          </label>
          <div className="sm:col-span-2">
            <button className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">Adicionar despesa</button>
          </div>
        </form>
      </section>
    </div>
  );
}
