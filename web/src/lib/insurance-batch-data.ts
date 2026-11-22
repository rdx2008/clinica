import { db } from "./db";
import { decryptField } from "./crypto";

export type GuideRow = {
  entryId: string;
  guide: string;
  date: Date;
  patient: string;
  card: string;
  authorization: string;
  service: string;
  tuss: string;
  amountCents: number;
  status: string;
};

// Carrega o lote com as guias já montadas (carteirinha descriptografada: só para telas autorizadas).
export async function loadBatchData(clinicId: string, insurerId: string, batchId: string) {
  const batch = await db.insuranceBatch.findFirst({ where: { id: batchId, clinicId, insurerId }, include: { insurer: true } });
  if (!batch) return null;
  const entries = await db.insuranceEntry.findMany({ where: { batchId: batch.id }, orderBy: { guideNumber: "asc" } });
  const [patients, appts, prices] = await Promise.all([
    db.patient.findMany({ where: { id: { in: [...new Set(entries.map((e) => e.patientId))] } }, select: { id: true, fullName: true } }),
    db.appointment.findMany({
      where: { id: { in: entries.map((e) => e.appointmentId) } },
      select: { id: true, serviceId: true, service: { select: { name: true } }, patientInsurance: { select: { cardEnc: true } }, authorization: { select: { code: true } } },
    }),
    db.insurerPrice.findMany({ where: { insurerId }, select: { serviceId: true, tussCode: true } }),
  ]);
  const name = new Map(patients.map((p) => [p.id, p.fullName]));
  const appt = new Map(appts.map((a) => [a.id, a]));
  const tuss = new Map(prices.map((p) => [p.serviceId, p.tussCode ?? ""]));

  const rows: GuideRow[] = entries.map((e) => {
    const a = appt.get(e.appointmentId);
    let card = "";
    try { card = a?.patientInsurance ? decryptField(a.patientInsurance.cardEnc) : ""; } catch { card = ""; }
    return {
      entryId: e.id,
      guide: e.guideNumber ?? "",
      date: e.serviceDate,
      patient: name.get(e.patientId) ?? "Paciente",
      card,
      authorization: a?.authorization?.code ?? "",
      service: a?.service.name ?? "Atendimento",
      tuss: a ? (tuss.get(a.serviceId) ?? "") : "",
      amountCents: e.amountCents,
      status: e.status,
    };
  });
  return { batch, rows, totalCents: rows.reduce((t, r) => t + r.amountCents, 0) };
}
