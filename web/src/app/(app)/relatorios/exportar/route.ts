import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { toCsv } from "@/lib/csv";
import { dayRange, localDate, localTime, STATUS_LABEL } from "@/lib/agenda";
import { shiftMonth, validMonth } from "@/lib/money";

export const dynamic = "force-dynamic";

// Atendimentos do mês em CSV (somente administrador).
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword || user.role !== "ADMIN") return new Response("Forbidden", { status: 403 });
  const mes = new URL(req.url).searchParams.get("mes") ?? "";
  if (!validMonth(mes)) return new Response("Bad request", { status: 400 });

  const start = dayRange(`${mes}-01`)!.start;
  const end = dayRange(`${shiftMonth(mes, 1)}-01`)!.start;
  const rows = await db.appointment.findMany({
    where: { clinicId: user.clinicId, startsAt: { gte: start, lt: end } },
    orderBy: { startsAt: "asc" },
    include: {
      patient: { select: { fullName: true } },
      service: { select: { name: true, modality: true } },
      professional: { include: { user: { select: { name: true } } } },
    },
  });

  await audit({ clinicId: user.clinicId, userId: user.id, action: "ATENDIMENTOS_EXPORTADOS", entity: "Appointment" });
  const csv = toCsv(
    ["Data", "Início", "Fim", "Paciente", "Profissional", "Serviço", "Modalidade", "Status", "Motivo do cancelamento"],
    rows.map((a) => [
      localDate(a.startsAt).split("-").reverse().join("/"),
      localTime(a.startsAt),
      localTime(a.endsAt),
      a.patient.fullName,
      a.professional.user.name,
      a.service.name,
      a.service.modality === "ONLINE" ? "Online" : "Presencial",
      STATUS_LABEL[a.status],
      a.cancelReason ?? "",
    ]),
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="atendimentos-${mes}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
