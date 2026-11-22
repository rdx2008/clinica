import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { decryptField } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { formatPhoneBR } from "@/lib/br";
import { RECORD_TYPE_LABEL, requireClinician } from "@/lib/clinical";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

// Visão de impressão (Ctrl+P / "Salvar como PDF"): papel timbrado com dados da clínica e assinatura.
export default async function PrintRecordPage({ params }: { params: Promise<{ id: string; recordId: string }> }) {
  const { user, professionalId } = await requireClinician();
  const { id, recordId } = await params;

  const rec = await db.clinicalRecord.findFirst({
    where: { id: recordId, patientId: id, clinicId: user.clinicId, professionalId },
    include: { patient: { select: { fullName: true } }, professional: { select: { councilType: true, councilNumber: true } } },
  });
  if (!rec) notFound();
  const clinic = await db.clinic.findUniqueOrThrow({ where: { id: user.clinicId } });

  await audit({ clinicId: user.clinicId, userId: user.id, action: "PRONTUARIO_IMPRESSO", entity: "ClinicalRecord", entityId: rec.id });

  const council = rec.professional.councilType && rec.professional.councilNumber ? `${rec.professional.councilType} ${rec.professional.councilNumber}` : null;
  const isDoc = rec.type === "DOCUMENTO";

  return (
    <div className="mx-auto max-w-[800px] space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <p className="text-sm text-zinc-600">Pré-visualização. Use “Imprimir” e escolha “Salvar como PDF” se preferir arquivo.</p>
        <PrintButton />
      </div>

      <article className="min-h-[1000px] rounded-lg border bg-white p-12 shadow-sm print:min-h-0 print:border-0 print:p-0 print:shadow-none">
        <header className="mb-8 border-b pb-4 text-center">
          <p className="font-[family-name:var(--font-display)] text-xl font-semibold">{clinic.name}</p>
          <p className="text-xs text-zinc-600">
            {[clinic.cnpj ? `CNPJ ${clinic.cnpj}` : null, clinic.address, clinic.phone ? formatPhoneBR(clinic.phone) : null, clinic.email].filter(Boolean).join(" · ")}
          </p>
        </header>

        {!isDoc && (
          <div className="mb-6 text-sm">
            <p className="text-base font-semibold">{RECORD_TYPE_LABEL[rec.type]}</p>
            <p>Paciente: {rec.patient.fullName}</p>
            <p>Data: {(rec.approvedAt ?? rec.createdAt).toLocaleDateString("pt-BR")}</p>
          </div>
        )}

        <pre className="whitespace-pre-wrap font-sans text-[15px] leading-relaxed">{decryptField(rec.contentEnc)}</pre>

        {!isDoc && (
          <footer className="mt-16 text-center text-sm">
            <div className="mx-auto w-72 border-t border-zinc-800 pt-1">
              {user.name}
              {council && <div className="text-xs text-zinc-600">{council}</div>}
            </div>
          </footer>
        )}
      </article>
    </div>
  );
}
