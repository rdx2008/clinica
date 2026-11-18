import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { canAccessPatient, RECORD_TYPE_LABEL, requireClinician } from "@/lib/clinical";

export const dynamic = "force-dynamic";

export default async function RecordsPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, professionalId } = await requireClinician();
  const { id } = await params;
  if (!(await canAccessPatient(user.clinicId, professionalId, id))) notFound();

  const [patient, records] = await Promise.all([
    db.patient.findFirst({ where: { id, clinicId: user.clinicId }, select: { fullName: true } }),
    db.clinicalRecord.findMany({
      where: { clinicId: user.clinicId, patientId: id, professionalId },
      orderBy: { createdAt: "desc" },
      select: { id: true, type: true, status: true, version: true, createdAt: true },
    }),
  ]);
  if (!patient) notFound();

  await audit({ clinicId: user.clinicId, userId: user.id, action: "PRONTUARIO_LISTA_VISUALIZADA", entity: "Patient", entityId: id });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={`/pacientes/${id}`} className="text-xs text-zinc-500 underline">← {patient.fullName}</Link>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Prontuário</h1>
        <Link href={`/pacientes/${id}/prontuario/novo`} className="rounded bg-emerald-700 px-3 py-2 text-sm text-white">Novo registro</Link>
      </div>
      <p className="text-xs text-zinc-500">
        Conteúdo sigiloso: visível apenas para você. Administração e recepção não têm acesso aos registros.
      </p>
      <ul className="divide-y rounded border text-sm">
        {records.length === 0 && <li className="p-3 text-zinc-500">Nenhum registro ainda.</li>}
        {records.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 p-3">
            <Link href={`/pacientes/${id}/prontuario/${r.id}`} className="font-medium underline">
              {RECORD_TYPE_LABEL[r.type]}
            </Link>
            <span className="text-xs text-zinc-500">
              {r.createdAt.toLocaleDateString("pt-BR")} · {r.status === "APROVADO" ? "aprovado" : "rascunho"} · v{r.version}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
