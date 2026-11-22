import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { localDate } from "@/lib/agenda";
import { effectiveStatus, formatBRL, shiftMonth, validMonth } from "@/lib/money";
import { cancelChargeAction, markPaidAction } from "@/app/actions/finance";
import { reopenChargeAction } from "@/app/actions/finance2";
import { createPixAction, issueInvoiceAction, refreshInvoiceAction } from "@/app/actions/gateway";
import { FinanceTabs } from "@/components/finance-tabs";

export const dynamic = "force-dynamic";

const btn = "rounded border px-2 py-1 text-xs";
const LABEL = { PENDENTE: "Pendente", PAGA: "Paga", VENCIDA: "Vencida", CANCELADA: "Cancelada" } as const;
const STYLE = {
  PENDENTE: "bg-zinc-100 text-zinc-700",
  PAGA: "bg-emerald-100 text-emerald-800",
  VENCIDA: "bg-red-100 text-red-700",
  CANCELADA: "bg-zinc-100 text-zinc-400 line-through",
} as const;
const METHOD: Record<string, string> = { PIX: "Pix", DINHEIRO: "Dinheiro", CARTAO: "Cartão", TRANSFERENCIA: "Transferência", OUTRO: "Outro" };

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ mes?: string; status?: string; erro?: string; ok?: string }> }) {
  const user = await requireRole("ADMIN", "FINANCEIRO", "RECEPCAO");
  const sp = await searchParams;
  const today = localDate(new Date());
  const mes = sp.mes && validMonth(sp.mes) ? sp.mes : today.slice(0, 7);
  const canManage = user.role !== "RECEPCAO";

  const [charges, expenses] = await Promise.all([
    db.charge.findMany({
      where: { clinicId: user.clinicId, competence: mes },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      include: { patient: { select: { fullName: true } }, invoices: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    canManage
      ? db.expense.aggregate({
          where: { clinicId: user.clinicId, date: { gte: new Date(`${mes}-01T00:00:00.000Z`), lt: new Date(`${shiftMonth(mes, 1)}-01T00:00:00.000Z`) } },
          _sum: { amountCents: true },
        })
      : null,
  ]);

  const all = charges.map((c) => ({ ...c, eff: effectiveStatus(c.status, c.dueDate.toISOString().slice(0, 10), today) }));
  const rows = sp.status && sp.status in LABEL ? all.filter((r) => r.eff === sp.status) : all;
  const sum = (s: string) => all.filter((r) => r.eff === s).reduce((t, r) => t + r.amountCents, 0);
  const received = sum("PAGA");
  const spent = expenses?._sum.amountCents ?? 0;

  const byMethod = new Map<string, number>();
  for (const r of all) if (r.eff === "PAGA" && r.method) byMethod.set(r.method, (byMethod.get(r.method) ?? 0) + r.amountCents);

  const q = (extra: string) => `/financeiro?mes=${mes}${extra}`;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl">Financeiro</h1>
        <div className="flex gap-2">
          <a href={`/financeiro/exportar?mes=${mes}`} className="rounded border px-3 py-2 text-sm">Exportar CSV</a>
          <Link href="/financeiro/nova" className="rounded bg-emerald-700 px-3 py-2 text-sm text-white">Nova cobrança</Link>
        </div>
      </div>
      <FinanceTabs active="/financeiro" mes={mes} limited={!canManage} />
      {sp.erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}
      {sp.ok && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{sp.ok}</p>}

      <div className="flex items-center gap-3 text-sm">
        <Link href={`/financeiro?mes=${shiftMonth(mes, -1)}`} className={btn}>←</Link>
        <strong className="min-w-16 text-center">{mes.split("-").reverse().join("/")}</strong>
        <Link href={`/financeiro?mes=${shiftMonth(mes, 1)}`} className={btn}>→</Link>
      </div>

      <div className={`grid gap-3 text-sm ${canManage ? "sm:grid-cols-5" : "sm:grid-cols-3"}`}>
        <div className="rounded-xl border bg-white p-3 shadow-sm"><p className="text-xs text-zinc-500">Recebido</p><p className="text-lg font-semibold text-emerald-700">{formatBRL(received)}</p></div>
        <div className="rounded-xl border bg-white p-3 shadow-sm"><p className="text-xs text-zinc-500">A receber</p><p className="text-lg font-semibold">{formatBRL(sum("PENDENTE"))}</p></div>
        <div className="rounded-xl border bg-white p-3 shadow-sm"><p className="text-xs text-zinc-500">Vencido</p><p className="text-lg font-semibold text-red-700">{formatBRL(sum("VENCIDA"))}</p></div>
        {canManage && (
          <>
            <div className="rounded-xl border bg-white p-3 shadow-sm"><p className="text-xs text-zinc-500">Despesas</p><p className="text-lg font-semibold">{formatBRL(spent)}</p></div>
            <div className="rounded-xl border bg-white p-3 shadow-sm"><p className="text-xs text-zinc-500">Resultado (recebido − despesas)</p><p className={`text-lg font-semibold ${received - spent < 0 ? "text-red-700" : "text-emerald-700"}`}>{formatBRL(received - spent)}</p></div>
          </>
        )}
      </div>

      {byMethod.size > 0 && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
          <span className="text-zinc-500">Recebido por forma:</span>
          {[...byMethod.entries()].map(([m, v]) => <span key={m}>{METHOD[m] ?? m}: <strong>{formatBRL(v)}</strong></span>)}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5 text-xs">
        <Link href={q("")} className={`rounded-full border px-2.5 py-1 ${!sp.status ? "bg-zinc-800 text-white" : "bg-white"}`}>Todas</Link>
        {(Object.keys(LABEL) as (keyof typeof LABEL)[]).map((s) => (
          <Link key={s} href={q(`&status=${s}`)} className={`rounded-full border px-2.5 py-1 ${sp.status === s ? "bg-zinc-800 text-white" : "bg-white"}`}>{LABEL[s]}</Link>
        ))}
      </div>

      <ul className="divide-y rounded border text-sm">
        {rows.length === 0 && <li className="p-4 text-zinc-500">Nenhuma cobrança neste filtro.</li>}
        {rows.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div>
              <p className="font-medium">{c.patient.fullName}</p>
              <p className="text-xs text-zinc-500">
                vence {c.dueDate.toISOString().slice(0, 10).split("-").reverse().join("/")}
                {c.paidAt && ` · pago em ${c.paidAt.toLocaleDateString("pt-BR")} (${METHOD[c.method ?? ""] ?? c.method?.toLowerCase()})`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{formatBRL(c.amountCents)}</span>
              <span className={`rounded px-2 py-0.5 text-xs ${STYLE[c.eff]}`}>{LABEL[c.eff]}</span>
              {c.eff === "PAGA" && (
                <>
                  <Link href={`/financeiro/${c.id}/recibo`} className={btn} target="_blank">Recibo</Link>
                  {canManage && (() => {
                    const inv = c.invoices[0];
                    if (inv && inv.status !== "ERRO" && inv.status !== "CANCELADA") {
                      return (
                        <span className="flex items-center gap-1">
                          <span className={`rounded px-2 py-0.5 text-xs ${inv.status === "EMITIDA" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                            NFS-e {inv.status === "EMITIDA" ? `nº ${inv.number ?? ""}` : inv.status === "CANCELANDO" ? "cancelando" : "em processamento"}
                          </span>
                          {inv.pdfUrl && <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer" className={btn}>PDF</a>}
                          {inv.status !== "EMITIDA" && (
                            <form action={refreshInvoiceAction}><input type="hidden" name="id" value={inv.id} /><button className={btn}>Atualizar</button></form>
                          )}
                        </span>
                      );
                    }
                    return (
                      <form action={issueInvoiceAction} className="flex items-center gap-1">
                        <input type="hidden" name="id" value={c.id} />
                        {inv?.status === "ERRO" && <span className="text-xs text-red-700" title={inv.errorMessage ?? ""}>nota recusada</span>}
                        <button className={btn}>Emitir NFS-e</button>
                      </form>
                    );
                  })()}
                  {canManage && (
                    <form action={reopenChargeAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <button className={btn} title="Volta a cobrança para pendente (estorno)">Estornar</button>
                    </form>
                  )}
                </>
              )}
              {(c.eff === "PENDENTE" || c.eff === "VENCIDA") && (
                <>
                  {c.pixPayload ? (
                    <Link href={`/financeiro/${c.id}/pix`} className={btn}>Ver Pix</Link>
                  ) : (
                    <form action={createPixAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <button className={btn}>Gerar Pix</button>
                    </form>
                  )}
                  <form action={markPaidAction} className="flex items-center gap-1">
                    <input type="hidden" name="id" value={c.id} />
                    <select name="method" className={btn} defaultValue="PIX">
                      {Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
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
