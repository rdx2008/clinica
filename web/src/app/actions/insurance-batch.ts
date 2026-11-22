"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";
import { localDate } from "@/lib/agenda";
import { validMonth } from "@/lib/money";
import { guideNumber } from "@/lib/insurance-core";

const FIN = ["ADMIN", "FINANCEIRO"] as const;

function dateOrNull(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function loadBatch(clinicId: string, id: string) {
  const b = await db.insuranceBatch.findFirst({ where: { id, clinicId } });
  if (!b) redirect("/financeiro/convenios");
  return b;
}

const batchUrl = (b: { insurerId: string; id: string }, q = "") => `/financeiro/convenios/${b.insurerId}/lote/${b.id}${q}`;
const err = (b: { insurerId: string; id: string }, m: string): never => redirect(batchUrl(b, `?erro=${encodeURIComponent(m)}`));

// Fecha um lote com todos os atendimentos a receber do convênio na competência.
export async function createBatchAction(formData: FormData) {
  const user = await requireRole(...FIN);
  const insurerId = String(formData.get("insurerId") ?? "");
  const mes = String(formData.get("mes") ?? "");
  const back = (m: string): never => redirect(`/financeiro/convenios/${insurerId}?mes=${mes}&erro=${encodeURIComponent(m)}`);
  const insurer = await db.insurer.findFirst({ where: { id: insurerId, clinicId: user.clinicId }, select: { id: true } });
  if (!insurer || !validMonth(mes)) redirect("/financeiro/convenios");

  let batchId = "";
  try {
    batchId = await db.$transaction(async (tx) => {
      const entries = await tx.insuranceEntry.findMany({
        where: { clinicId: user.clinicId, insurerId, competence: mes, status: "A_FATURAR", batchId: null },
        orderBy: [{ serviceDate: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      });
      if (entries.length === 0) throw new Error("EMPTY");
      const last = await tx.insuranceBatch.aggregate({ where: { clinicId: user.clinicId }, _max: { number: true } });
      const number = (last._max.number ?? 0) + 1;
      const batch = await tx.insuranceBatch.create({ data: { clinicId: user.clinicId, insurerId, competence: mes, number } });
      for (const [i, e] of entries.entries()) {
        await tx.insuranceEntry.update({ where: { id: e.id }, data: { batchId: batch.id, guideNumber: guideNumber(number, i + 1), status: "FATURADO" } });
      }
      return batch.id;
    });
  } catch (e) {
    if (e instanceof Error && e.message === "EMPTY") return back("Não há atendimentos a faturar nesta competência.");
    return back("Não foi possível criar o lote (outro lote foi criado ao mesmo tempo). Tente de novo.");
  }
  await audit({ clinicId: user.clinicId, userId: user.id, action: "LOTE_CRIADO", entity: "InsuranceBatch", entityId: batchId });
  redirect(`/financeiro/convenios/${insurerId}/lote/${batchId}`);
}

export async function sendBatchAction(formData: FormData) {
  const user = await requireRole(...FIN);
  const b = await loadBatch(user.clinicId, String(formData.get("id") ?? ""));
  const sentAt = dateOrNull(String(formData.get("date") ?? "")) ?? new Date(`${localDate(new Date())}T00:00:00.000Z`);
  const protocol = String(formData.get("protocol") ?? "").trim().slice(0, 60) || null;
  await db.insuranceBatch.update({ where: { id: b.id }, data: { status: "ENVIADO", sentAt, protocol } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "LOTE_ENVIADO", entity: "InsuranceBatch", entityId: b.id });
  redirect(batchUrl(b, `?ok=${encodeURIComponent("Lote marcado como enviado.")}`));
}

export async function reopenBatchAction(formData: FormData) {
  const user = await requireRole(...FIN);
  const b = await loadBatch(user.clinicId, String(formData.get("id") ?? ""));
  await db.insuranceBatch.update({ where: { id: b.id }, data: { status: "ABERTO", sentAt: null, protocol: null } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "LOTE_REABERTO", entity: "InsuranceBatch", entityId: b.id });
  redirect(batchUrl(b));
}

// Nota fiscal do lote, emitida por fora: o sistema só guarda os dados para controle.
export async function saveBatchInvoiceAction(formData: FormData) {
  const user = await requireRole(...FIN);
  const b = await loadBatch(user.clinicId, String(formData.get("id") ?? ""));
  const number = String(formData.get("number") ?? "").trim().slice(0, 40) || null;
  const rawDate = String(formData.get("date") ?? "");
  const date = rawDate ? dateOrNull(rawDate) : null;
  if (rawDate && !date) return err(b, "Data da nota inválida.");
  const url = String(formData.get("url") ?? "").trim();
  if (url && !/^https?:\/\//i.test(url)) return err(b, "O link da nota deve começar com http:// ou https://.");
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 500) || null;
  await db.insuranceBatch.update({ where: { id: b.id }, data: { invoiceNumber: number, invoiceDate: date, invoiceUrl: url || null, notes } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "LOTE_NOTA_REGISTRADA", entity: "InsuranceBatch", entityId: b.id });
  redirect(batchUrl(b, `?ok=${encodeURIComponent("Dados da nota salvos.")}`));
}

// Tira um atendimento do lote (volta para a receber), enquanto não recebido.
export async function removeFromBatchAction(formData: FormData) {
  const user = await requireRole(...FIN);
  const e = await db.insuranceEntry.findFirst({ where: { id: String(formData.get("id") ?? ""), clinicId: user.clinicId } });
  if (!e || !e.batchId) redirect("/financeiro/convenios");
  const b = await loadBatch(user.clinicId, e.batchId);
  if (e.status !== "FATURADO") return err(b, "Só é possível tirar do lote atendimentos ainda não recebidos.");
  await db.insuranceEntry.update({ where: { id: e.id }, data: { batchId: null, guideNumber: null, status: "A_FATURAR" } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "LOTE_ATENDIMENTO_REMOVIDO", entity: "InsuranceEntry", entityId: e.id });
  redirect(batchUrl(b));
}

// Desfaz o lote: os atendimentos voltam para a receber. Não vale se algum já foi recebido.
export async function deleteBatchAction(formData: FormData) {
  const user = await requireRole(...FIN);
  const b = await loadBatch(user.clinicId, String(formData.get("id") ?? ""));
  const paid = await db.insuranceEntry.count({ where: { batchId: b.id, status: "PAGO" } });
  if (paid > 0) return err(b, "O lote tem atendimentos já recebidos e não pode ser desfeito.");
  await db.$transaction([
    db.insuranceEntry.updateMany({ where: { batchId: b.id }, data: { batchId: null, guideNumber: null, status: "A_FATURAR" } }),
    db.insuranceBatch.delete({ where: { id: b.id } }),
  ]);
  await audit({ clinicId: user.clinicId, userId: user.id, action: "LOTE_DESFEITO", entity: "InsuranceBatch", entityId: b.id });
  redirect(`/financeiro/convenios/${b.insurerId}?mes=${b.competence}`);
}
