"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";
import { localDate } from "@/lib/agenda";
import { parseBRL } from "@/lib/money";
import { settle } from "@/lib/insurance-core";
import { addPayment, paidTotal } from "@/lib/insurance-pay";

const FIN = ["ADMIN", "FINANCEIRO"] as const;

function dateOrToday(raw: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T00:00:00.000Z`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date(`${localDate(new Date())}T00:00:00.000Z`);
}

// "" = guia sem retorno ainda; "0" = glosa total; demais valores em reais.
function parseReturn(raw: string): number | null | "skip" {
  const t = raw.trim();
  if (t === "") return "skip";
  if (/^0+([.,]0+)?$/.test(t)) return 0;
  return parseBRL(t);
}

const lotUrl = (insurerId: string, batchId: string, q = "") => `/financeiro/convenios/${insurerId}/lote/${batchId}${q}`;

// Conciliação do demonstrativo: valor pago por guia. Diferença vira glosa, com o motivo informado pelo convênio.
export async function registerReturnAction(formData: FormData) {
  const user = await requireRole(...FIN);
  const batchId = String(formData.get("batchId") ?? "");
  const batch = await db.insuranceBatch.findFirst({ where: { id: batchId, clinicId: user.clinicId } });
  if (!batch) redirect("/financeiro/convenios");
  const back = (m: string): never => redirect(`${lotUrl(batch.insurerId, batch.id, "/retorno")}?erro=${encodeURIComponent(m)}`);
  const paidAt = dateOrToday(String(formData.get("date") ?? ""));
  const entries = await db.insuranceEntry.findMany({ where: { batchId: batch.id, status: "FATURADO" } });

  const plan: { e: (typeof entries)[number]; paid: number; reason: string | null }[] = [];
  for (const e of entries) {
    const v = parseReturn(String(formData.get(`paid_${e.id}`) ?? ""));
    if (v === "skip") continue;
    if (v === null) return back(`Valor inválido na guia ${e.guideNumber}.`);
    const r = settle(e.amountCents, v);
    if (!r) return back(`A guia ${e.guideNumber} não pode ter valor pago maior que o faturado.`);
    const reason = String(formData.get(`reason_${e.id}`) ?? "").trim().slice(0, 200);
    plan.push({ e, paid: v, reason: r.status === "GLOSADO" ? reason || "Sem motivo informado" : null });
  }
  if (plan.length === 0) return back("Nenhuma guia com valor informado.");

  await db.$transaction(async (tx) => {
    for (const { e, paid, reason } of plan) {
      await addPayment(tx, e, paid, paidAt, "RETORNO");
      const full = paid >= e.amountCents;
      await tx.insuranceEntry.update({
        where: { id: e.id },
        data: { status: full ? "PAGO" : "GLOSADO", glossReason: reason, ...(paid > 0 ? { paidAt, paymentMonth: paidAt.toISOString().slice(0, 7) } : {}) },
      });
    }
  });
  const glossed = plan.filter((p) => p.paid < p.e.amountCents).length;
  await audit({ clinicId: user.clinicId, userId: user.id, action: "LOTE_RETORNO_REGISTRADO", entity: "InsuranceBatch", entityId: batch.id });
  redirect(lotUrl(batch.insurerId, batch.id, `?ok=${encodeURIComponent(`Retorno registrado: ${plan.length - glossed} guia(s) paga(s) e ${glossed} com glosa.`)}`));
}

async function loadEntry(clinicId: string, id: string) {
  const e = await db.insuranceEntry.findFirst({ where: { id, clinicId } });
  if (!e) redirect("/financeiro/convenios");
  const url = (q = "") => (e.batchId ? lotUrl(e.insurerId, e.batchId, q) : `/financeiro/convenios/${e.insurerId}?mes=${e.competence}${q.replace("?", "&")}`);
  return { e, url };
}

export async function appealGlossAction(formData: FormData) {
  const user = await requireRole(...FIN);
  const { e, url } = await loadEntry(user.clinicId, String(formData.get("id") ?? ""));
  if (e.status !== "GLOSADO") redirect(url(`?erro=${encodeURIComponent("Só glosas em aberto podem ir para recurso.")}`));
  const note = String(formData.get("note") ?? "").trim().slice(0, 500) || null;
  await db.insuranceEntry.update({ where: { id: e.id }, data: { status: "RECURSO", appealNote: note } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "GLOSA_RECURSO", entity: "InsuranceEntry", entityId: e.id });
  redirect(url());
}

// Valor recuperado no recurso (ou pagamento posterior). Completou o valor da guia = recebida.
export async function recoverGlossAction(formData: FormData) {
  const user = await requireRole(...FIN);
  const { e, url } = await loadEntry(user.clinicId, String(formData.get("id") ?? ""));
  const fail = (m: string): never => redirect(url(`?erro=${encodeURIComponent(m)}`));
  if (e.status !== "GLOSADO" && e.status !== "RECURSO") return fail("Este atendimento não tem glosa em aberto.");
  const cents = parseBRL(String(formData.get("amount") ?? ""));
  if (!cents || cents <= 0) return fail("Valor inválido.");
  const paidAt = dateOrToday(String(formData.get("date") ?? ""));
  const result = await db.$transaction(async (tx) => {
    const already = await paidTotal(tx, e.id);
    if (already + cents > e.amountCents) return "over" as const;
    await addPayment(tx, e, cents, paidAt, "RECURSO");
    const full = already + cents >= e.amountCents;
    await tx.insuranceEntry.update({ where: { id: e.id }, data: { status: full ? "PAGO" : e.status, glossReason: full ? null : e.glossReason, paidAt, paymentMonth: paidAt.toISOString().slice(0, 7) } });
    return "ok" as const;
  });
  if (result === "over") return fail("O valor recuperado ultrapassa o valor da guia.");
  await audit({ clinicId: user.clinicId, userId: user.id, action: "GLOSA_RECUPERADA", entity: "InsuranceEntry", entityId: e.id });
  redirect(url());
}

// Desiste de recuperar o restante: vira perda definitiva (relatório de glosa aceita).
export async function acceptGlossAction(formData: FormData) {
  const user = await requireRole(...FIN);
  const { e, url } = await loadEntry(user.clinicId, String(formData.get("id") ?? ""));
  if (e.status !== "GLOSADO" && e.status !== "RECURSO") redirect(url(`?erro=${encodeURIComponent("Este atendimento não tem glosa em aberto.")}`));
  await db.insuranceEntry.update({ where: { id: e.id }, data: { status: "GLOSA_ACEITA" } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "GLOSA_ACEITA", entity: "InsuranceEntry", entityId: e.id });
  redirect(url());
}
