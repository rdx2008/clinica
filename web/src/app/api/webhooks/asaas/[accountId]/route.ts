import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { decryptField } from "@/lib/crypto";
import { mapInvoiceStatus, methodFromBilling, parseInvoiceEvent, parsePaymentEvent, safeEqual } from "@/lib/asaas-core";

export const dynamic = "force-dynamic";

// Webhook do Asaas (uma URL por conta, com o id da conta no caminho).
// Autenticação: o Asaas envia o segredo combinado no cabeçalho "asaas-access-token".
// Idempotente: o mesmo evento pode chegar mais de uma vez (guardamos o id do evento).
export async function POST(request: Request, ctx: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await ctx.params;
  const acc = await db.paymentAccount.findUnique({ where: { id: accountId } });
  if (!acc) return new Response("Not found", { status: 404 });

  const given = request.headers.get("asaas-access-token") ?? "";
  if (!safeEqual(given, decryptField(acc.webhookToken))) return new Response("Unauthorized", { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const clinicId = acc.clinicId;
  let recorded: string | null = null;

  try {
    const pay = parsePaymentEvent(body);
    const inv = pay ? null : parseInvoiceEvent(body);
    const eventId = pay?.eventId ?? inv?.eventId;
    if (!eventId) return new Response("OK", { status: 200 }); // evento que não usamos

    try {
      await db.webhookEvent.create({ data: { id: eventId, provider: "ASAAS" } });
      recorded = eventId;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return new Response("OK", { status: 200 }); // já processado
      throw e;
    }

    if (pay) {
      const charge = await db.charge.findFirst({
        where: { clinicId, OR: [{ gatewayId: pay.paymentId }, ...(pay.externalReference ? [{ id: pay.externalReference }] : [])] },
      });
      if (charge) {
        if ((pay.event === "PAYMENT_RECEIVED" || pay.event === "PAYMENT_CONFIRMED") && charge.status === "PENDENTE") {
          // Pix e boleto são "RECEIVED"; cartão passa por "CONFIRMED". Ambos contam como pago.
          await db.charge.update({
            where: { id: charge.id },
            data: { status: "PAGA", method: methodFromBilling(pay.billingType), paidAt: pay.paymentDate ?? new Date(), gatewayId: charge.gatewayId ?? pay.paymentId },
          });
          await db.auditLog.create({ data: { clinicId, action: "COBRANCA_PAGA_GATEWAY", entity: "Charge", entityId: charge.id } });
        } else if (pay.event === "PAYMENT_DELETED" && charge.status === "PENDENTE") {
          await db.charge.update({ where: { id: charge.id }, data: { status: "CANCELADA" } });
          await db.auditLog.create({ data: { clinicId, action: "COBRANCA_CANCELADA_GATEWAY", entity: "Charge", entityId: charge.id } });
        } else if (pay.event === "PAYMENT_REFUNDED" && charge.status === "PAGA") {
          await db.charge.update({ where: { id: charge.id }, data: { status: "PENDENTE", paidAt: null, method: null } });
          await db.auditLog.create({ data: { clinicId, action: "COBRANCA_ESTORNADA_GATEWAY", entity: "Charge", entityId: charge.id } });
        }
      }
    } else if (inv) {
      const invoice = await db.invoice.findFirst({ where: { clinicId, OR: [{ externalId: inv.invoiceId }, ...(inv.externalReference ? [{ chargeId: inv.externalReference }] : [])] } });
      if (invoice) {
        await db.invoice.update({
          where: { id: invoice.id },
          data: {
            status: mapInvoiceStatus(inv.status),
            externalId: invoice.externalId ?? inv.invoiceId,
            ...(inv.number ? { number: inv.number } : {}),
            ...(inv.pdfUrl ? { pdfUrl: inv.pdfUrl } : {}),
            ...(inv.xmlUrl ? { xmlUrl: inv.xmlUrl } : {}),
            errorMessage: mapInvoiceStatus(inv.status) === "ERRO" ? (inv.statusDescription ?? "A prefeitura recusou a nota. Verifique os dados fiscais.") : null,
          },
        });
        await db.auditLog.create({ data: { clinicId, action: `NFSE_${inv.event.replace("INVOICE_", "")}`, entity: "Invoice", entityId: invoice.id } });
      }
    }
  } catch {
    // 500: o Asaas reenvia. Remove o registro do evento para o reenvio ser processado de verdade.
    if (recorded) await db.webhookEvent.delete({ where: { id: recorded } }).catch(() => {});
    return new Response("Error", { status: 500 });
  }
  return new Response("OK", { status: 200 });
}
