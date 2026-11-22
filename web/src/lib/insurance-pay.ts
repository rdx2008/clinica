import type { Prisma } from "@prisma/client";

type EntryRef = { id: string; clinicId: string; insurerId: string; professionalId: string };

// Registra um valor pago pelo convênio. O repasse do profissional é calculado a partir desses pagamentos.
export async function addPayment(tx: Prisma.TransactionClient, e: EntryRef, cents: number, paidAt: Date, kind: "RETORNO" | "RECURSO") {
  if (cents <= 0) return;
  await tx.insurancePayment.create({
    data: { clinicId: e.clinicId, entryId: e.id, insurerId: e.insurerId, professionalId: e.professionalId, amountCents: cents, paidAt, paymentMonth: paidAt.toISOString().slice(0, 7), kind },
  });
}

export async function paidTotal(tx: Prisma.TransactionClient, entryId: string): Promise<number> {
  const r = await tx.insurancePayment.aggregate({ where: { entryId }, _sum: { amountCents: true } });
  return r._sum.amountCents ?? 0;
}
