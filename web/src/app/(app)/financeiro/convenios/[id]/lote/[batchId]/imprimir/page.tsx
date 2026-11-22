import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";
import { formatPhoneBR } from "@/lib/br";
import { formatBRL } from "@/lib/money";
import { loadBatchData } from "@/lib/insurance-batch-data";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

const fmt = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");

// Resumo do lote para conferência e para o contador emitir a nota.
export default async function BatchPrintPage({ params }: { params: Promise<{ id: string; batchId: string }> }) {
  const user = await requireRole("ADMIN", "FINANCEIRO");
  const { id, batchId } = await params;
  const [data, clinic] = await Promise.all([loadBatchData(user.clinicId, id, batchId), db.clinic.findUniqueOrThrow({ where: { id: user.clinicId } })]);
  if (!data) notFound();
  const { batch, rows, totalCents } = data;
  await audit({ clinicId: user.clinicId, userId: user.id, action: "LOTE_RESUMO_IMPRESSO", entity: "InsuranceBatch", entityId: batch.id });

  return (
    <div className="mx-auto max-w-[900px] space-y-4">
      <div className="flex justify-end print:hidden"><PrintButton /></div>
      <article className="space-y-5 rounded-lg border bg-white p-10 text-sm shadow-sm print:border-0 print:p-0 print:shadow-none">
        <header className="border-b pb-3">
          <p className="font-[family-name:var(--font-display)] text-xl font-semibold">{clinic.name}</p>
          <p className="text-xs text-zinc-600">{[clinic.cnpj ? `CNPJ ${clinic.cnpj}` : null, clinic.address, clinic.phone ? formatPhoneBR(clinic.phone) : null].filter(Boolean).join(" · ")}</p>
        </header>
        <h1 className="text-lg">Resumo do lote {batch.number} — {batch.insurer.name}</h1>
        <dl className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <div><dt className="inline text-zinc-500">Competência: </dt><dd className="inline">{batch.competence.split("-").reverse().join("/")}</dd></div>
          <div><dt className="inline text-zinc-500">Convênio: </dt><dd className="inline">{batch.insurer.name}{batch.insurer.cnpj ? ` (CNPJ ${batch.insurer.cnpj})` : ""}</dd></div>
          <div><dt className="inline text-zinc-500">Guias: </dt><dd className="inline">{rows.length}</dd></div>
          <div><dt className="inline text-zinc-500">Valor total: </dt><dd className="inline font-semibold">{formatBRL(totalCents)}</dd></div>
          {batch.sentAt && <div><dt className="inline text-zinc-500">Enviado em: </dt><dd className="inline">{fmt(batch.sentAt)}{batch.protocol ? ` · protocolo ${batch.protocol}` : ""}</dd></div>}
          {batch.invoiceNumber && <div><dt className="inline text-zinc-500">Nota fiscal: </dt><dd className="inline">{batch.invoiceNumber}{batch.invoiceDate ? ` de ${fmt(batch.invoiceDate)}` : ""}</dd></div>}
        </dl>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b text-left text-zinc-500">
              <th className="py-1 pr-2">Guia</th><th className="pr-2">Data</th><th className="pr-2">Paciente</th><th className="pr-2">Carteirinha</th><th className="pr-2">Autorização</th><th className="pr-2">Serviço</th><th className="text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.entryId} className="border-b">
                <td className="py-1 pr-2">{r.guide}</td><td className="pr-2">{fmt(r.date)}</td><td className="pr-2">{r.patient}</td><td className="pr-2">{r.card}</td>
                <td className="pr-2">{r.authorization}</td><td className="pr-2">{r.service}{r.tuss ? ` (${r.tuss})` : ""}</td><td className="text-right">{formatBRL(r.amountCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={6} className="pt-2 text-right font-semibold">Total</td><td className="pt-2 text-right font-semibold">{formatBRL(totalCents)}</td></tr></tfoot>
        </table>
        <p className="text-xs text-zinc-500">Documento de conferência interna. Contém dados pessoais de pacientes: compartilhe apenas com o contador e com o convênio.</p>
      </article>
    </div>
  );
}
