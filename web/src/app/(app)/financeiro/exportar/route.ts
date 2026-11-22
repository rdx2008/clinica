import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { toCsv } from "@/lib/csv";
import { effectiveStatus, shiftMonth, validMonth } from "@/lib/money";
import { localDate } from "@/lib/agenda";

export const dynamic = "force-dynamic";

// Exporta as cobranças e despesas do mês em CSV (Excel pt-BR: separador ";").
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword || !["ADMIN", "FINANCEIRO", "RECEPCAO"].includes(user.role)) return new Response("Forbidden", { status: 403 });
  const mes = new URL(req.url).searchParams.get("mes") ?? "";
  if (!validMonth(mes)) return new Response("Bad request", { status: 400 });
  const today = localDate(new Date());

  const [charges, expenses] = await Promise.all([
    db.charge.findMany({ where: { clinicId: user.clinicId, competence: mes }, orderBy: { dueDate: "asc" }, include: { patient: { select: { fullName: true } } } }),
    user.role === "RECEPCAO"
      ? []
      : db.expense.findMany({
          where: { clinicId: user.clinicId, date: { gte: new Date(`${mes}-01T00:00:00.000Z`), lt: new Date(`${shiftMonth(mes, 1)}-01T00:00:00.000Z`) } },
          orderBy: { date: "asc" },
        }),
  ]);

  const brl = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10).split("-").reverse().join("/") : "");
  const rows: (string | number | null)[][] = [
    ...charges.map((c) => ["Receita", c.patient.fullName, brl(c.amountCents), d(c.dueDate), effectiveStatus(c.status, c.dueDate.toISOString().slice(0, 10), today), c.method ?? "", d(c.paidAt)]),
    ...expenses.map((e) => ["Despesa", `${e.category}: ${e.description}`, brl(-e.amountCents), d(e.date), e.paidAt ? "PAGA" : "PENDENTE", "", d(e.paidAt)]),
  ];

  await audit({ clinicId: user.clinicId, userId: user.id, action: "FINANCEIRO_EXPORTADO", entity: "Charge" });
  return new Response(toCsv(["Tipo", "Descrição", "Valor (R$)", "Vencimento", "Status", "Forma", "Pago em"], rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="financeiro-${mes}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
