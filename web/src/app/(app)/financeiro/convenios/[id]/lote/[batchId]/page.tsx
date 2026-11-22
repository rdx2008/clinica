import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";
import { localDate } from "@/lib/agenda";
import { formatBRL } from "@/lib/money";
import { loadBatchData } from "@/lib/insurance-batch-data";
import { db } from "@/lib/db";
import { GlossActions } from "@/components/gloss-actions";
import { issueBatchInvoiceAction, refreshBatchInvoiceAction } from "@/app/actions/insurance-batch";
import { deleteBatchAction, removeFromBatchAction, reopenBatchAction, saveBatchInvoiceAction, sendBatchAction } from "@/app/actions/insurance-batch";

export const dynamic = "force-dynamic";

const input = "rounded border bg-white px-3 py-2 text-sm";
const btn = "rounded border px-2 py-1 text-xs";
const STATUS_STYLE: Record<string, { label: string; style: string }> = {
  FATURADO: { label: "Faturado", style: "bg-blue-100 text-blue-800" },
  PAGO: { label: "Recebido", style: "bg-emerald-100 text-emerald-800" },
  GLOSADO: { label: "Glosado", style: "bg-red-100 text-red-700" },
  RECURSO: { label: "Em recurso", style: "bg-amber-100 text-amber-800" },
  GLOSA_ACEITA: { label: "Glosa aceita", style: "bg-zinc-200 text-zinc-700" },
};
const fmt = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");
const mask = (card: string) => (card.length > 4 ? `${"•".repeat(Math.min(card.length - 4, 8))}${card.slice(-4)}` : card);

export default async function BatchPage({ params, searchParams }: { params: Promise<{ id: string; batchId: string }>; searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const user = await requireRole("ADMIN", "FINANCEIRO");
  const { id, batchId } = await params;
  const sp = await searchParams;
  const data = await loadBatchData(user.clinicId, id, batchId);
  if (!data) notFound();
  const { batch, rows, totalCents } = data;
  await audit({ clinicId: user.clinicId, userId: user.id, action: "LOTE_VISUALIZADO", entity: "InsuranceBatch", entityId: batch.id });
  const today = localDate(new Date());
  const payRows = await db.insurancePayment.findMany({ where: { entryId: { in: rows.map((r) => r.entryId) } }, select: { entryId: true, amountCents: true } });
  const paid = new Map<string, number>();
  for (const r of payRows) paid.set(r.entryId, (paid.get(r.entryId) ?? 0) + r.amountCents);
  const reasons = new Map((await db.insuranceEntry.findMany({ where: { batchId: batch.id }, select: { id: true, glossReason: true, appealNote: true } })).map((e) => [e.id, e]));
  const asaasOn = !!(await db.paymentAccount.findUnique({ where: { clinicId: user.clinicId }, select: { status: true } }).then((a) => a?.status === "ATIVA"));
  const pendingReturn = rows.filter((r) => r.status === "FATURADO").length;
  const receivedTotal = rows.reduce((t, r) => t + (paid.get(r.entryId) ?? 0), 0);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link href={`/financeiro/convenios/${id}?mes=${batch.competence}`} className="text-xs text-zinc-500 underline">← {batch.insurer.name}</Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl">Lote {batch.number} · {batch.insurer.name} · {batch.competence.split("-").reverse().join("/")}</h1>
        <div className="flex gap-2">
          <Link href={`/financeiro/convenios/${id}/lote/${batch.id}/imprimir`} target="_blank" className="rounded border px-3 py-2 text-sm">Resumo para impressão</Link>
          <a href={`/financeiro/convenios/${id}/lote/${batch.id}/exportar`} className="rounded border px-3 py-2 text-sm">Exportar CSV</a>
        </div>
      </div>
      {sp.erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}
      {sp.ok && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{sp.ok}</p>}

      <div className="grid gap-3 text-sm sm:grid-cols-4">
        <div className="rounded-xl border bg-white p-3 shadow-sm"><p className="text-xs text-zinc-500">Guias</p><p className="text-lg font-semibold">{rows.length}</p></div>
        <div className="rounded-xl border bg-white p-3 shadow-sm"><p className="text-xs text-zinc-500">Valor do lote</p><p className="text-lg font-semibold">{formatBRL(totalCents)}</p></div>
        <div className="rounded-xl border bg-white p-3 shadow-sm"><p className="text-xs text-zinc-500">Recebido</p><p className="text-lg font-semibold text-emerald-700">{formatBRL(receivedTotal)}</p></div>
        <div className="rounded-xl border bg-white p-3 shadow-sm">
          <p className="text-xs text-zinc-500">Situação</p>
          <p className="text-lg font-semibold">{batch.status === "ENVIADO" ? "Enviado" : "Aberto"}</p>
          {batch.sentAt && <p className="text-xs text-zinc-500">em {fmt(batch.sentAt)}{batch.protocol ? ` · protocolo ${batch.protocol}` : ""}</p>}
        </div>
      </div>

      {pendingReturn > 0 && (
        <Link href={`/financeiro/convenios/${id}/lote/${batch.id}/retorno`} className="block rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          {pendingReturn} guia(s) aguardando retorno do convênio. <span className="underline">Registrar retorno do demonstrativo</span>
        </Link>
      )}

      <ul className="divide-y rounded border bg-white text-sm">
        {rows.map((r) => (
          <li key={r.entryId} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div>
              <p className="font-medium">{r.guide} · {r.patient}</p>
              <p className="text-xs text-zinc-500">
                {fmt(r.date)} · {r.service}{r.tuss && ` (TUSS ${r.tuss})`}
                {r.card && ` · carteirinha ${mask(r.card)}`}{r.authorization && ` · autorização ${r.authorization}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{formatBRL(r.amountCents)}{(paid.get(r.entryId) ?? 0) > 0 && (paid.get(r.entryId) ?? 0) < r.amountCents && <span className="ml-1 text-xs font-normal text-zinc-500">(pago {formatBRL(paid.get(r.entryId) ?? 0)})</span>}</span>
              <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[r.status]?.style ?? ""}`}>{STATUS_STYLE[r.status]?.label ?? r.status}</span>
              {r.status === "FATURADO" && (
                <form action={removeFromBatchAction}>
                  <input type="hidden" name="id" value={r.entryId} />
                  <button className={btn}>Tirar do lote</button>
                </form>
              )}
            </div>
            {reasons.get(r.entryId)?.glossReason && <p className="w-full text-xs text-red-700">Glosa: {reasons.get(r.entryId)?.glossReason}{reasons.get(r.entryId)?.appealNote ? ` · recurso: ${reasons.get(r.entryId)?.appealNote}` : ""}</p>}
            <GlossActions id={r.entryId} status={r.status} today={today} />
          </li>
        ))}
      </ul>

      <section className="space-y-3 rounded border bg-white p-4">
        <h2>Envio ao convênio</h2>
        {batch.status === "ABERTO" ? (
          <form action={sendBatchAction} className="flex flex-wrap items-end gap-2 text-sm">
            <input type="hidden" name="id" value={batch.id} />
            <label className="text-xs">Data do envio<input name="date" type="date" defaultValue={today} className={`${input} ml-2`} /></label>
            <label className="text-xs">Protocolo (opcional)<input name="protocol" className={`${input} ml-2 w-44`} /></label>
            <button className="rounded bg-emerald-700 px-3 py-2 text-sm text-white">Marcar como enviado</button>
          </form>
        ) : (
          <form action={reopenBatchAction} className="flex items-center gap-3 text-sm">
            <input type="hidden" name="id" value={batch.id} />
            <span className="text-zinc-600">Enviado em {batch.sentAt ? fmt(batch.sentAt) : "—"}{batch.protocol ? ` · protocolo ${batch.protocol}` : ""}</span>
            <button className={btn}>Reabrir lote</button>
          </form>
        )}
        <p className="text-xs text-zinc-500">O envio em si é feito no portal da operadora. Aqui fica o controle de quando e com qual protocolo.</p>
      </section>

      <section className="space-y-3 rounded border bg-white p-4">
        <h2>Emitir nota pelo sistema (Asaas)</h2>
        <p className="text-xs text-zinc-500">
          Opcional. Emite a NFS-e para o convênio (tomador pelo CNPJ) sobre o valor já recebido: <strong>{formatBRL(receivedTotal)}</strong>.
          Exige o Asaas conectado com os dados fiscais confirmados pelo contador e o CNPJ do convênio cadastrado. Se preferir emitir por fora, use o formulário abaixo.
        </p>
        {batch.invoiceExternalId && batch.invoiceStatus !== "ERRO" && batch.invoiceStatus !== "CANCELADA" ? (
          <form action={refreshBatchInvoiceAction} className="flex flex-wrap items-center gap-3 text-sm">
            <input type="hidden" name="id" value={batch.id} />
            <span className={`rounded px-2 py-0.5 text-xs ${batch.invoiceStatus === "EMITIDA" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
              NFS-e {batch.invoiceStatus === "EMITIDA" ? `emitida${batch.invoiceNumber ? ` nº ${batch.invoiceNumber}` : ""}` : "em processamento"}
            </span>
            {batch.invoiceStatus !== "EMITIDA" && <button className={btn}>Atualizar</button>}
          </form>
        ) : (
          <form action={issueBatchInvoiceAction} className="flex flex-wrap items-center gap-3 text-sm">
            <input type="hidden" name="id" value={batch.id} />
            <button disabled={!asaasOn || receivedTotal <= 0} className="rounded border border-emerald-700 px-3 py-2 text-sm text-emerald-800 disabled:opacity-50">Emitir NFS-e do lote</button>
            {!asaasOn && <span className="text-xs text-zinc-500">Asaas não conectado.</span>}
            {asaasOn && receivedTotal <= 0 && <span className="text-xs text-zinc-500">Registre o retorno do convênio antes.</span>}
            {batch.invoiceStatus === "ERRO" && <span className="text-xs text-red-700">A última tentativa foi recusada pela prefeitura.</span>}
          </form>
        )}
      </section>

      <form action={saveBatchInvoiceAction} className="space-y-3 rounded border bg-white p-4">
        <h2>Nota fiscal do lote</h2>
        <p className="text-xs text-zinc-500">Emitida por fora (prefeitura ou contador). Registre aqui para controlar quais lotes já têm nota.</p>
        <input type="hidden" name="id" value={batch.id} />
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">Número<input name="number" defaultValue={batch.invoiceNumber ?? ""} className={`${input} mt-1 w-full`} /></label>
          <label className="block text-sm">Data<input name="date" type="date" defaultValue={batch.invoiceDate ? batch.invoiceDate.toISOString().slice(0, 10) : ""} className={`${input} mt-1 w-full`} /></label>
          <label className="block text-sm">Link (opcional)<input name="url" type="url" defaultValue={batch.invoiceUrl ?? ""} placeholder="https://…" className={`${input} mt-1 w-full`} /></label>
        </div>
        <label className="block text-sm">Observações<textarea name="notes" rows={2} defaultValue={batch.notes ?? ""} className={`${input} mt-1 w-full`} /></label>
        <div className="flex flex-wrap items-center gap-3">
          <button className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">Salvar</button>
          {batch.invoiceUrl && <a href={batch.invoiceUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-emerald-700 underline">Abrir nota</a>}
        </div>
      </form>

      <form action={deleteBatchAction}>
        <input type="hidden" name="id" value={batch.id} />
        <button className="rounded border border-red-300 px-3 py-2 text-sm text-red-700">Desfazer lote (os atendimentos voltam para a faturar)</button>
      </form>
    </div>
  );
}
