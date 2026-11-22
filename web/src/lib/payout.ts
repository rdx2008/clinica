import { db } from "./db";
import { payoutShare } from "./insurance-core";

export type PayoutFigures = { particularCents: number; insuranceCents: number; grossCents: number; shareCents: number };

// Recebido no mês por profissional: cobranças pagas de pacientes (por competência) mais o que os convênios
// efetivamente pagaram no mês (por data de recebimento). O repasse aplica o percentual de cada convênio.
export async function payoutFigures(clinicId: string, professionals: { id: string; sharePercent: number }[], mes: string): Promise<Map<string, PayoutFigures>> {
  const [charges, entries] = await Promise.all([
    db.charge.findMany({
      where: { clinicId, status: "PAGA", competence: mes, appointmentId: { not: null } },
      select: { amountCents: true, appointment: { select: { professionalId: true } } },
    }),
    db.insurancePayment.findMany({
      where: { clinicId, paymentMonth: mes },
      select: { amountCents: true, professionalId: true, insurerId: true },
    }),
  ]);
  const insurers = await db.insurer.findMany({ where: { clinicId }, select: { id: true, sharePercent: true } });
  const insurerShare = new Map(insurers.map((i) => [i.id, i.sharePercent]));
  const particular = new Map<string, number>();
  for (const c of charges) {
    const pid = c.appointment?.professionalId;
    if (pid) particular.set(pid, (particular.get(pid) ?? 0) + c.amountCents);
  }
  const out = new Map<string, PayoutFigures>();
  for (const p of professionals) {
    const mine = entries.filter((e) => e.professionalId === p.id);
    const part = particular.get(p.id) ?? 0;
    const r = payoutShare(part, p.sharePercent, mine.map((e) => ({ percent: insurerShare.get(e.insurerId) ?? null, cents: e.amountCents })));
    out.set(p.id, { particularCents: part, insuranceCents: mine.reduce((t, e) => t + e.amountCents, 0), ...r });
  }
  return out;
}
