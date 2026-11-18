import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { decryptField } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { MAX_RECORD_CHARS, RECORD_TYPE_LABEL, requireClinician } from "@/lib/clinical";
import { approveRecordAction, deleteDraftAction, updateRecordAction } from "@/app/actions/records";

export const dynamic = "force-dynamic";

const btn = "rounded border px-3 py-1 text-sm";

export default async function RecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; recordId: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { user, professionalId } = await requireClinician();
  const { id, recordId } = await params;
  const { erro } = await searchParams;

  const rec = await db.clinicalRecord.findFirst({
    where: { id: recordId, patientId: id, clinicId: user.clinicId, professionalId },
    include: { patient: { select: { fullName: true } }, _count: { select: { versions: true } } },
  });
  if (!rec) notFound();

  await audit({ clinicId: user.clinicId, userId: user.id, action: "PRONTUARIO_VISUALIZADO", entity: "ClinicalRecord", entityId: rec.id });
  const content = decryptField(rec.contentEnc);
  const approved = rec.status === "APROVADO";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={`/pacientes/${id}/prontuario`} className="text-xs text-zinc-500 underline">← Prontuário de {rec.patient.fullName}</Link>
      <h1 className="text-xl font-semibold">
        {RECORD_TYPE_LABEL[rec.type]}{" "}
        <span className="text-sm font-normal text-zinc-500">
          · {approved ? `aprovado em ${rec.approvedAt?.toLocaleDateString("pt-BR")}` : "rascunho"} · v{rec.version}
          {rec._count.versions > 0 && ` (${rec._count.versions} versões anteriores guardadas)`}
        </span>
      </h1>
      {erro && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{erro}</p>}

      {approved ? (
        <pre className="whitespace-pre-wrap rounded border p-4 font-sans text-sm">{content}</pre>
      ) : (
        <>
          <form action={updateRecordAction} className="space-y-2">
            <input type="hidden" name="id" value={rec.id} />
            <textarea name="content" required rows={14} maxLength={MAX_RECORD_CHARS} defaultValue={content} className="w-full rounded border px-3 py-2 text-sm" />
            <button className={btn}>Salvar alterações</button>
          </form>
          <div className="flex gap-2">
            <form action={approveRecordAction}>
              <input type="hidden" name="id" value={rec.id} />
              <button className="rounded bg-emerald-700 px-3 py-1 text-sm text-white">Aprovar (trava o registro)</button>
            </form>
            <form action={deleteDraftAction}>
              <input type="hidden" name="id" value={rec.id} />
              <button className={btn}>Descartar rascunho</button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
