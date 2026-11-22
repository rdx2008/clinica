import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";
import { formatPhoneBR } from "@/lib/br";
import { fillTerm } from "@/lib/terms-templates";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

// Documento para assinatura em papel: texto, dados do paciente e linhas de assinatura.
export default async function PrintTermPage({ params }: { params: Promise<{ id: string; docId: string }> }) {
  const user = await requireRole("ADMIN", "RECEPCAO", "PROFISSIONAL");
  const { id, docId } = await params;
  const [patient, doc, clinic] = await Promise.all([
    db.patient.findFirst({ where: { id, clinicId: user.clinicId }, select: { fullName: true } }),
    db.clinicDocument.findFirst({ where: { id: docId, clinicId: user.clinicId } }),
    db.clinic.findUniqueOrThrow({ where: { id: user.clinicId } }),
  ]);
  if (!patient || !doc) notFound();
  await audit({ clinicId: user.clinicId, userId: user.id, action: "TERMO_IMPRESSO", entity: "ClinicDocument", entityId: doc.id });

  return (
    <div className="mx-auto max-w-[800px] space-y-4">
      <div className="flex justify-end print:hidden"><PrintButton /></div>
      <article className="space-y-6 rounded-lg border bg-white p-12 shadow-sm print:border-0 print:p-0 print:shadow-none">
        <header className="border-b pb-3 text-center">
          <p className="font-[family-name:var(--font-display)] text-xl font-semibold">{clinic.name}</p>
          <p className="text-xs text-zinc-600">{[clinic.cnpj ? `CNPJ ${clinic.cnpj}` : null, clinic.address, clinic.phone ? formatPhoneBR(clinic.phone) : null].filter(Boolean).join(" · ")}</p>
        </header>
        <h1 className="text-center text-lg">{doc.title}</h1>
        <p className="text-sm">Paciente: <strong>{patient.fullName}</strong> · Versão {doc.version}</p>
        <pre className="whitespace-pre-wrap font-sans text-[14px] leading-relaxed">{fillTerm(doc.body, { clinica: clinic.name, cnpj: clinic.cnpj ? ` — CNPJ ${clinic.cnpj}` : "", paciente: patient.fullName })}</pre>
        <footer className="grid gap-10 pt-12 text-center text-sm sm:grid-cols-2">
          <div className="border-t border-zinc-800 pt-1">Paciente ou responsável legal<br /><span className="text-xs text-zinc-500">Data: ____/____/______</span></div>
          <div className="border-t border-zinc-800 pt-1">{clinic.name}<br /><span className="text-xs text-zinc-500">Profissional responsável</span></div>
        </footer>
      </article>
    </div>
  );
}
