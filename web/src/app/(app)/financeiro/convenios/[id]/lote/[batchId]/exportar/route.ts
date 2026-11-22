import { getCurrentUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { toCsv } from "@/lib/csv";
import { loadBatchData } from "@/lib/insurance-batch-data";

export const dynamic = "force-dynamic";

// Guias do lote em CSV (Excel pt-BR: separador ";"), para conferência, contador ou digitação no portal da operadora.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; batchId: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword || !["ADMIN", "FINANCEIRO"].includes(user.role)) return new Response("Forbidden", { status: 403 });
  const { id, batchId } = await params;
  const data = await loadBatchData(user.clinicId, id, batchId);
  if (!data) return new Response("Not found", { status: 404 });

  const brl = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const d = (x: Date) => x.toISOString().slice(0, 10).split("-").reverse().join("/");
  const rows = data.rows.map((r) => [r.guide, d(r.date), r.patient, r.card, r.authorization, r.service, r.tuss, brl(r.amountCents)]);

  await audit({ clinicId: user.clinicId, userId: user.id, action: "LOTE_EXPORTADO", entity: "InsuranceBatch", entityId: data.batch.id });
  return new Response(toCsv(["Guia", "Data", "Paciente", "Carteirinha", "Autorização", "Serviço", "TUSS", "Valor (R$)"], rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lote-${data.batch.number}-${data.batch.competence}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
