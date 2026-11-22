import { timingSafeEqual } from "node:crypto";
import { runReminders } from "@/lib/reminder-runner";
import { runPortalNotices } from "@/lib/portal-notice-runner";
import { refreshPendingBatchInvoices } from "@/lib/batch-invoice-refresh";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Chamado por um agendador (ex.: tarefa agendada do Coolify, a cada 10 minutos):
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://SEU-DOMINIO/api/cron/lembretes
// Uma só chamada executa: lembretes de consulta, avisos de pendência do portal e a atualização
// das notas de lote de convênio. Uma tarefa falhar não impede as outras.
export async function POST(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  const safe = async <T,>(fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch {
      return "erro";
    }
  };
  const lembretes = await safe(() => runReminders());
  const avisos = await safe(() => runPortalNotices());
  const notas = await safe(() => refreshPendingBatchInvoices());
  const failed = [lembretes, avisos, notas].every((r) => r === "erro");
  return Response.json({ lembretes, avisos, notas }, { status: failed ? 500 : 200 });
}
