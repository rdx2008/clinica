import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getPortalSession, patientsForEmail } from "@/lib/portal";
import { fillTerm } from "@/lib/terms-templates";
import { acceptTermPortalAction } from "@/app/actions/terms";

export const dynamic = "force-dynamic";

export default async function PortalTerm({ params, searchParams }: { params: Promise<{ slug: string; docId: string }>; searchParams: Promise<{ erro?: string }> }) {
  const { slug, docId } = await params;
  const sp = await searchParams;
  const s = await getPortalSession(slug);
  if (!s) redirect(`/p/${slug}`);
  const doc = await db.clinicDocument.findFirst({ where: { id: docId, clinicId: s.clinic.id, active: true } });
  if (!doc) notFound();
  const patients = await patientsForEmail(s.clinic.id, s.email);
  const clinic = await db.clinic.findUniqueOrThrow({ where: { id: s.clinic.id }, select: { name: true, cnpj: true } });
  const accepted = new Set((await db.documentAcceptance.findMany({ where: { documentId: doc.id, patientId: { in: patients.map((p) => p.id) } }, select: { patientId: true } })).map((a) => a.patientId));
  const open = patients.filter((p) => !accepted.has(p.id));

  return (
    <div className="space-y-4">
      <Link href={`/p/${slug}/inicio`} className="text-xs text-zinc-500 underline">← Voltar</Link>
      <h1 className="text-2xl">{doc.title}</h1>
      {sp.erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}
      <pre className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-xl border bg-white p-4 font-sans text-sm leading-relaxed">
        {fillTerm(doc.body, { clinica: clinic.name, cnpj: clinic.cnpj ? ` — CNPJ ${clinic.cnpj}` : "" })}
      </pre>

      {open.length === 0 ? (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Este documento já foi aceito. ✓</p>
      ) : (
        <form action={acceptTermPortalAction} className="space-y-3 rounded-xl border bg-white p-4">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="docId" value={doc.id} />
          {open.length > 1 ? (
            <label className="block text-sm">Paciente
              <select name="patientId" required defaultValue="" className="mt-1 w-full rounded border px-3 py-2">
                <option value="" disabled>Selecione…</option>
                {open.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
              </select>
            </label>
          ) : (
            <input type="hidden" name="patientId" value={open[0].id} />
          )}
          <label className="block text-sm">Seu nome completo
            <input name="name" required autoComplete="name" className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <label className="block text-sm">Quem está aceitando
            <select name="relation" defaultValue="próprio" className="mt-1 w-full rounded border px-3 py-2">
              <option value="próprio">O próprio paciente</option>
              <option value="responsável legal">Responsável legal</option>
            </select>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="agree" required className="mt-1" />
            Li e concordo com o documento acima.
          </label>
          <button className="w-full rounded bg-emerald-700 px-4 py-3 text-white">Aceitar</button>
        </form>
      )}
    </div>
  );
}
