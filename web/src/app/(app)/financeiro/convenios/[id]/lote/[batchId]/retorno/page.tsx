import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { localDate } from "@/lib/agenda";
import { formatBRL } from "@/lib/money";
import { loadBatchData } from "@/lib/insurance-batch-data";
import { registerReturnAction } from "@/app/actions/insurance-gloss";

export const dynamic = "force-dynamic";

const input = "rounded border bg-white px-2 py-1.5 text-sm";
const fmt = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");

// Conciliação: transcreve o demonstrativo da operadora. O valor já vem preenchido como pago integral;
// ajuste as guias glosadas, informe o motivo e deixe em branco o que ainda não teve retorno.
export default async function ReturnPage({ params, searchParams }: { params: Promise<{ id: string; batchId: string }>; searchParams: Promise<{ erro?: string }> }) {
  const user = await requireRole("ADMIN", "FINANCEIRO");
  const { id, batchId } = await params;
  const sp = await searchParams;
  const data = await loadBatchData(user.clinicId, id, batchId);
  if (!data) notFound();
  const { batch, rows } = data;
  const pending = rows.filter((r) => r.status === "FATURADO");

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link href={`/financeiro/convenios/${id}/lote/${batch.id}`} className="text-xs text-zinc-500 underline">← Lote {batch.number}</Link>
      <h1 className="text-2xl">Retorno do demonstrativo · {batch.insurer.name} · lote {batch.number}</h1>
      {sp.erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}
      <p className="text-sm text-zinc-600">
        Informe o valor que o convênio pagou em cada guia. Valor menor que o faturado vira glosa (informe o motivo do demonstrativo); você pode enviar a glosa para recurso depois.
        Guia sem valor informado continua aguardando retorno. O repasse dos profissionais considera apenas o que foi pago.
      </p>

      {pending.length === 0 ? (
        <p className="rounded border bg-white p-4 text-sm text-zinc-500">Todas as guias deste lote já tiveram retorno.</p>
      ) : (
        <form action={registerReturnAction} className="space-y-3">
          <input type="hidden" name="batchId" value={batch.id} />
          <label className="inline-block text-sm">Data do pagamento
            <input name="date" type="date" defaultValue={localDate(new Date())} className={`${input} ml-2`} />
          </label>
          <ul className="divide-y rounded border bg-white text-sm">
            {pending.map((r) => (
              <li key={r.entryId} className="grid gap-2 p-3 sm:grid-cols-[1fr_9rem_1fr] sm:items-center">
                <div>
                  <p className="font-medium">{r.guide} · {r.patient}</p>
                  <p className="text-xs text-zinc-500">{fmt(r.date)} · {r.service} · faturado {formatBRL(r.amountCents)}</p>
                </div>
                <label className="text-xs text-zinc-500">Valor pago (R$)
                  <input name={`paid_${r.entryId}`} defaultValue={(r.amountCents / 100).toFixed(2).replace(".", ",")} inputMode="decimal" className={`${input} mt-0.5 w-full`} />
                </label>
                <label className="text-xs text-zinc-500">Motivo da glosa (se houver)
                  <input name={`reason_${r.entryId}`} maxLength={200} placeholder="Ex.: guia sem autorização válida" className={`${input} mt-0.5 w-full`} />
                </label>
              </li>
            ))}
          </ul>
          <button className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">Registrar retorno</button>
        </form>
      )}
    </div>
  );
}
