import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { canAccessPatient, requireClinician } from "@/lib/clinical";
import { isScaleKey, SCALES } from "@/lib/scales";
import { ScaleFields } from "@/components/scale-form";
import { applyScaleInSessionAction } from "@/app/actions/scales";

export const dynamic = "force-dynamic";

export default async function ApplyScalePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ escala?: string; erro?: string }> }) {
  const { user, professionalId } = await requireClinician();
  const { id } = await params;
  const sp = await searchParams;
  const key = sp.escala ?? "";
  if (!isScaleKey(key) || !(await canAccessPatient(user.clinicId, professionalId, id))) notFound();
  const patient = await db.patient.findFirst({ where: { id, clinicId: user.clinicId }, select: { fullName: true } });
  if (!patient) notFound();
  const def = SCALES[key];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={`/pacientes/${id}/escalas`} className="text-xs text-zinc-500 underline">← Escalas de {patient.fullName}</Link>
      <div>
        <h1 className="text-2xl">{def.name}</h1>
        <p className="text-sm text-zinc-600">{def.full}. Preencha com o paciente durante a sessão.</p>
      </div>
      {sp.erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}
      <form action={applyScaleInSessionAction} className="space-y-4">
        <input type="hidden" name="patientId" value={id} />
        <input type="hidden" name="scaleKey" value={key} />
        <ScaleFields def={def} />
        <button className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">Salvar resultado</button>
      </form>
    </div>
  );
}
