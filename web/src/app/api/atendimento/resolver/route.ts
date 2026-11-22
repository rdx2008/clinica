import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isMeetCode, nearestTo } from "@/lib/meet-core";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store" };

// Usado pela extensão do navegador: dado o código de uma sala do Meet, devolve a consulta do
// profissional logado que usa esse link. Só devolve o id (nenhum dado do paciente).
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return Response.json({ error: "login" }, { status: 401, headers: HEADERS });
  if (user.role !== "PROFISSIONAL") return Response.json({ error: "perfil" }, { status: 403, headers: HEADERS });

  const code = (new URL(request.url).searchParams.get("codigo") ?? "").toLowerCase();
  if (!isMeetCode(code)) return Response.json({ error: "codigo" }, { status: 400, headers: HEADERS });

  const professional = await db.professional.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!professional) return Response.json({ error: "perfil" }, { status: 403, headers: HEADERS });

  const now = Date.now();
  const rows = await db.appointment.findMany({
    where: {
      clinicId: user.clinicId,
      professionalId: professional.id,
      status: { in: ["AGENDADA", "CONFIRMADA", "COMPARECEU"] },
      meetingUrl: { contains: code, mode: "insensitive" },
      startsAt: { gt: new Date(now - 3 * 24 * 3600_000), lt: new Date(now + 30 * 24 * 3600_000) },
    },
    select: { id: true, startsAt: true },
    take: 50,
  });
  const best = nearestTo(rows);
  if (!best) return Response.json({ error: "sem_consulta" }, { status: 404, headers: HEADERS });
  return Response.json({ appointmentId: best.id }, { headers: HEADERS });
}
