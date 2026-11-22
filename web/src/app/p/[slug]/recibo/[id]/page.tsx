import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getPortalSession, patientsForEmail } from "@/lib/portal";
import { formatBRL, valorPorExtenso } from "@/lib/money";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

const METHOD: Record<string, string> = { PIX: "Pix", DINHEIRO: "dinheiro", CARTAO: "cartão", TRANSFERENCIA: "transferência", OUTRO: "outra forma" };

export default async function PortalReceipt({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const s = await getPortalSession(slug);
  if (!s) redirect(`/p/${slug}`);
  const patients = await patientsForEmail(s.clinic.id, s.email);
  const c = await db.charge.findFirst({
    where: { id, clinicId: s.clinic.id, patientId: { in: patients.map((p) => p.id) }, status: "PAGA" },
    include: { patient: { select: { fullName: true } }, appointment: { select: { startsAt: true, service: { select: { name: true } } } } },
  });
  if (!c || !c.paidAt) notFound();
  const clinic = await db.clinic.findUniqueOrThrow({ where: { id: s.clinic.id } });

  const number = `${c.paidAt.getUTCFullYear()}-${c.id.slice(-6).toUpperCase()}`;
  const ref = c.appointment ? `${c.appointment.service.name} realizado em ${c.appointment.startsAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : "serviços prestados";
  await db.auditLog.create({ data: { clinicId: s.clinic.id, action: "RECIBO_PORTAL", entity: "Charge", entityId: c.id } });

  return (
    <div className="space-y-4">
      <div className="flex justify-end print:hidden"><PrintButton /></div>
      <article className="space-y-6 rounded-lg border bg-white p-8 shadow-sm print:border-0 print:p-0 print:shadow-none">
        <header className="border-b pb-3 text-center">
          <p className="font-[family-name:var(--font-display)] text-xl font-semibold">{clinic.name}</p>
          <p className="text-xs text-zinc-600">{[clinic.cnpj ? `CNPJ ${clinic.cnpj}` : null, clinic.address, clinic.phone].filter(Boolean).join(" · ")}</p>
        </header>
        <div className="flex items-baseline justify-between"><h1 className="text-2xl">RECIBO</h1><p className="text-sm text-zinc-600">Nº {number}</p></div>
        <p className="text-right text-xl font-semibold">{formatBRL(c.amountCents)}</p>
        <p className="leading-loose">
          Recebi de <strong>{c.patient.fullName}</strong> a importância de <strong>{formatBRL(c.amountCents)}</strong> ({valorPorExtenso(c.amountCents)}), referente a {ref}, pago em{" "}
          {c.paidAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} por {METHOD[c.method ?? ""] ?? "outra forma"}.
        </p>
        <footer className="pt-10 text-center text-sm"><div className="mx-auto w-64 border-t border-zinc-800 pt-1">{clinic.name}</div></footer>
      </article>
    </div>
  );
}
