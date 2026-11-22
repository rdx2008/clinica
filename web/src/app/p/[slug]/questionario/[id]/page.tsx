import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getPortalSession, patientsForEmail } from "@/lib/portal";
import { isScaleKey, RISK_SUPPORT_MESSAGE, SCALES } from "@/lib/scales";
import { ScaleFields } from "@/components/scale-form";
import { submitScalePortalAction } from "@/app/actions/scales";

export const dynamic = "force-dynamic";

export default async function PortalQuestionnaire({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ feito?: string; erro?: string }>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const s = await getPortalSession(slug);
  if (!s) redirect(`/p/${slug}`);
  const patients = await patientsForEmail(s.clinic.id, s.email);
  const a = await db.scaleAssignment.findFirst({ where: { id, clinicId: s.clinic.id, patientId: { in: patients.map((p) => p.id) } } });
  if (!a || !isScaleKey(a.scaleKey)) notFound();
  const def = SCALES[a.scaleKey];

  if (a.status === "RESPONDIDA" || sp.feito) {
    return (
      <div className="space-y-4 rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl">Obrigado!</h1>
        <p className="text-sm text-zinc-600">Suas respostas foram enviadas ao seu psicólogo(a), que vai conversar com você sobre elas.</p>
        {sp.feito === "risco" && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{RISK_SUPPORT_MESSAGE}</p>}
        <Link href={`/p/${slug}/inicio`} className="inline-block rounded border px-4 py-2 text-sm">Voltar ao início</Link>
      </div>
    );
  }
  if (a.status !== "PENDENTE") notFound();

  return (
    <div className="space-y-4">
      <Link href={`/p/${slug}/inicio`} className="text-xs text-zinc-500 underline">← Voltar</Link>
      <div>
        <h1 className="text-2xl">{def.name}</h1>
        <p className="text-sm text-zinc-600">{def.full}. Não há respostas certas ou erradas; responda com sinceridade. Só o seu psicólogo(a) verá as respostas.</p>
      </div>
      {sp.erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}
      <form action={submitScalePortalAction} className="space-y-4">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="id" value={id} />
        <ScaleFields def={def} />
        <button className="w-full rounded bg-emerald-700 px-4 py-3 text-white">Enviar respostas</button>
      </form>
    </div>
  );
}
