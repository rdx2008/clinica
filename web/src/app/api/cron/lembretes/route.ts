import { timingSafeEqual } from "node:crypto";
import { runReminders } from "@/lib/reminder-runner";

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
export async function POST(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });
  try {
    return Response.json(await runReminders());
  } catch {
    return new Response("Error", { status: 500 });
  }
}
