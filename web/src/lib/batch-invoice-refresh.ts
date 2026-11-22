import { db } from "./db";
import { localDate } from "./agenda";
import { asaas, loadAsaas } from "./asaas";
import { mapInvoiceStatus } from "./asaas-core";

export type RefreshResult = { ok: true; status: string; message?: string } | { ok: false; error: string };

// Consulta no Asaas a situação da nota emitida para um lote e grava número, link e status.
export async function refreshBatchInvoice(clinicId: string, batchId: string): Promise<RefreshResult> {
  const b = await db.insuranceBatch.findFirst({ where: { id: batchId, clinicId } });
  if (!b?.invoiceExternalId) return { ok: false, error: "Este lote não tem nota emitida pelo sistema." };
  const ctx = await loadAsaas(clinicId);
  if (!ctx) return { ok: false, error: "Conecte o Asaas em Configurações → Pagamentos." };
  const r = await asaas<{ status?: string; number?: string | number; pdfUrl?: string; statusDescription?: string }>(ctx, "GET", `/invoices/${b.invoiceExternalId}`);
  if (!r.ok) return { ok: false, error: r.error };
  const status = mapInvoiceStatus(r.data.status);
  await db.insuranceBatch.update({
    where: { id: b.id },
    data: {
      invoiceStatus: status,
      ...(r.data.number ? { invoiceNumber: String(r.data.number) } : {}),
      ...(r.data.pdfUrl ? { invoiceUrl: r.data.pdfUrl } : {}),
      ...(status === "EMITIDA" && !b.invoiceDate ? { invoiceDate: new Date(`${localDate(new Date())}T00:00:00.000Z`) } : {}),
    },
  });
  return { ok: true, status, message: status === "ERRO" ? r.data.statusDescription : undefined };
}

// Para o agendador: atualiza todas as notas de lote ainda em andamento (até 50 por execução).
export async function refreshPendingBatchInvoices() {
  const stats = { verificados: 0, emitidas: 0, erros: 0 };
  const batches = await db.insuranceBatch.findMany({
    where: { invoiceExternalId: { not: null }, invoiceStatus: { in: ["AGENDADA", "CANCELANDO"] } },
    select: { id: true, clinicId: true },
    take: 50,
  });
  for (const b of batches) {
    const r = await refreshBatchInvoice(b.clinicId, b.id);
    stats.verificados++;
    if (!r.ok || r.status === "ERRO") stats.erros++;
    else if (r.status === "EMITIDA") stats.emitidas++;
  }
  return stats;
}
