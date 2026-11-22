import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";
import { formatPhoneBR } from "@/lib/br";
import { formatBRL, valorPorExtenso } from "@/lib/money";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

const METHOD: Record<string, string> = { PIX: "Pix", DINHEIRO: "dinheiro", CARTAO: "cartão", TRANSFERENCIA: "transferência", OUTRO: "outra forma" };

// Recibo de cobrança paga, pronto para imprimir ou salvar em PDF.
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("ADMIN", "FINANCEIRO", "RECEPCAO");
  const { id } = await params;
  const c = await db.charge.findFirst({
    where: { id, clinicId: user.clinicId, status: "PAGA" },
    include: {
      patient: { select: { fullName: true } },
      appointment: { select: { startsAt: true, service: { select: { name: true } }, professional: { include: { user: { select: { name: true } } } } } },
    },
  });
  if (!c || !c.paidAt) notFound();
  const clinic = await db.clinic.findUniqueOrThrow({ where: { id: user.clinicId } });
  await audit({ clinicId: user.clinicId, userId: user.id, action: "RECIBO_EMITIDO", entity: "Charge", entityId: c.id });

  const number = `${c.paidAt.getUTCFullYear()}-${c.id.slice(-6).toUpperCase()}`;
  const ref = c.appointment
    ? `${c.appointment.service.name} realizado em ${c.appointment.startsAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
    : "serviços prestados";

  return (
    <div className="mx-auto max-w-[760px] space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <p className="text-sm text-zinc-600">Use “Imprimir” e escolha “Salvar como PDF” se preferir arquivo.</p>
        <PrintButton />
      </div>
      <article className="rounded-lg border bg-white p-12 shadow-sm print:border-0 print:p-0 print:shadow-none">
        <header className="mb-8 border-b pb-4 text-center">
          <p className="font-[family-name:var(--font-display)] text-xl font-semibold">{clinic.name}</p>
          <p className="text-xs text-zinc-600">
            {[clinic.cnpj ? `CNPJ ${clinic.cnpj}` : null, clinic.address, clinic.phone ? formatPhoneBR(clinic.phone) : null, clinic.email].filter(Boolean).join(" · ")}
          </p>
        </header>

        <div className="mb-8 flex items-baseline justify-between">
          <h1 className="text-2xl">RECIBO</h1>
          <p className="text-sm text-zinc-600">Nº {number}</p>
        </div>
        <p className="mb-8 text-right text-xl font-semibold">{formatBRL(c.amountCents)}</p>

        <p className="text-[15px] leading-loose">
          Recebi de <strong>{c.patient.fullName}</strong> a importância de <strong>{formatBRL(c.amountCents)}</strong> ({valorPorExtenso(c.amountCents)}),
          referente a {ref}
          {c.appointment && <> com {c.appointment.professional.user.name}</>}, pago em{" "}
          {c.paidAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} por {METHOD[c.method ?? ""] ?? "outra forma"}.
        </p>
        <p className="mt-3 text-[15px]">Para clareza, firmo o presente.</p>

        <footer className="mt-20 text-center text-sm">
          <p className="mb-10 text-right">{c.paidAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "long", year: "numeric" })}</p>
          <div className="mx-auto w-72 border-t border-zinc-800 pt-1">{clinic.name}</div>
        </footer>
      </article>
    </div>
  );
}
