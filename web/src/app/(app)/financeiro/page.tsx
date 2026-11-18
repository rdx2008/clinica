import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { localDate } from "@/lib/agenda";
import { effectiveStatus, formatBRL, shiftMonth, validMonth } from "@/lib/money";
import { cancelChargeAction, markPaidAction } from "@/app/actions/finance";

export const dynamic = "force-dynamic";

const btn = "rounded border px-2 py-1 text-xs";
const LABEL = { PENDENTE: "Pendente", PAGA: "Paga", VENCIDA: "Vencida", CANCELADA: "Cancelada" } as const;
const STYLE = {
  PENDENTE: "bg-zinc-100 text-zinc-700",
  PAGA: "bg-emerald-100 text-emerald-800",
  VENCIDA: "bg-red-100 text-red-700",
  CANCELADA: "bg-zinc-100 text-zinc-400 line-through",
} as const;

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireRole("ADMIN", "FINANCEIRO", "RECEPCAO");
  const sp = await searchParams;
  const today = localDate(new Date());
  const mes = sp.mes && validMonth(sp.mes) ? sp.mes : today.slice(0, 7);

  const charges = await db.charge.findMany({
    where: { clinicId: user.clinicId, competence: mes },
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    include: { patient: { select: { fullName: true } } },
  });

  const rows = charges.map((c) => ({ ...c, eff: effectiveStatus(c.status, c.dueDate.toISOString().slice(0, 10), today) }));
  const sum = (s: string) => rows.filter((r) => r.eff === s).reduce((t, r) => t + r.amountCents, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Financeiro</h1>
        <Link href="/financeiro/nova" className="rounded bg-emerald-700 px-3 py-2 text-sm text-white">Nova cobrança</Link>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <Link href={`/financeiro?mes=${shiftMonth(mes, -1)}`} className={btn}>←</Link>
        <strong>{mes.split("-").reverse().join("/")}</strong>
        <Link href={`/financeiro?mes=${shiftMonth(mes, 1)}`} className={btn}>→</Link>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="rounded border p-3"><p className="text-xs text-zinc-500">Recebido</p><p className="text-lg font-semibold text-emerald-700">{formatBRL(sum("PAGA"))}</p></div>
        <div className="rounded border p-3"><p className="text-xs text-zinc-500">A receber</p><p className="text-lg font-semibold">{formatBRL(sum("PENDENTE"))}</p></div>
        <div className="rounded border p-3"><p className="text-xs text-zinc-500">Vencido</p><p className="text-lg font-semibold text-red-700">{formatBRL(sum("VENCIDA"))}</p></div>
      </div>

      <ul className="divide-y rounded border text-sm">
        {rows.length === 0 && <li className="p-3 text-zinc-500">Nenhuma cobrança nesta competência.</li>}
        {rows.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div>
              <p className="font-medium">{c.patient.fullName}</p>
              <p className="text-xs text-zinc-500">
                vence {c.dueDate.toISOString().slice(0, 10).split("-").reverse().join("/")}
                {c.paidAt && ` · pago em ${c.paidAt.toLocaleDateString("pt-BR")} (${c.method?.toLowerCase()})`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{formatBRL(c.amountCents)}</span>
              <span className={`rounded px-2 py-0.5 text-xs ${STYLE[c.eff]}`}>{LABEL[c.eff]}</span>
              {(c.eff === "PENDENTE" || c.eff === "VENCIDA") && (
                <>
                  <form action={markPaidAction} className="flex items-center gap-1">
                    <input type="hidden" name="id" value={c.id} />
                    <select name="method" className={btn} defaultValue="PIX">
                      <option value="PIX">Pix</option>
                      <option value="DINHEIRO">Dinheiro</option>
                      <option value="CARTAO">Cartão</option>
                      <option value="TRANSFERENCIA">Transferência</option>
                      <option value="OUTRO">Outro</option>
                    </select>
                    <button className={btn}>Marcar paga</button>
                  </form>
                  <form action={cancelChargeAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <button className={btn}>Cancelar</button>
                  </form>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
