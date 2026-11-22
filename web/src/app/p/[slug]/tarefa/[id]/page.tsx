import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { decryptField } from "@/lib/crypto";
import { getPortalSession, patientsForEmail } from "@/lib/portal";
import { completeTaskPortalAction } from "@/app/actions/tasks";

export const dynamic = "force-dynamic";

export default async function PortalTask({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ erro?: string }> }) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const s = await getPortalSession(slug);
  if (!s) redirect(`/p/${slug}`);
  const patients = await patientsForEmail(s.clinic.id, s.email);
  const t = await db.patientTask.findFirst({ where: { id, clinicId: s.clinic.id, patientId: { in: patients.map((p) => p.id) }, status: { in: ["PENDENTE", "FEITA"] } } });
  if (!t) notFound();

  if (t.status === "FEITA") {
    return (
      <div className="space-y-4 rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl">Tarefa concluída</h1>
        <p className="text-sm text-zinc-600">Obrigado! Seu psicólogo(a) vai ver o que você registrou e conversar com você na próxima sessão.</p>
        <Link href={`/p/${slug}/inicio`} className="inline-block rounded border px-4 py-2 text-sm">Voltar ao início</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link href={`/p/${slug}/inicio`} className="text-xs text-zinc-500 underline">← Voltar</Link>
      <div className="space-y-2 rounded-2xl border bg-white p-5 shadow-sm">
        <h1 className="text-2xl">{decryptField(t.titleEnc)}</h1>
        {t.textEnc && <p className="whitespace-pre-wrap text-sm text-zinc-700">{decryptField(t.textEnc)}</p>}
        {t.dueDate && <p className="text-xs text-zinc-500">Para {t.dueDate.toLocaleDateString("pt-BR", { timeZone: "UTC" })}</p>}
      </div>
      {sp.erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}
      <form action={completeTaskPortalAction} className="space-y-3">
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="id" value={id} />
        <label className="block text-sm">Como foi? (opcional)
          <textarea name="response" rows={6} maxLength={3000} placeholder="Escreva aqui o que quiser compartilhar com seu psicólogo(a). Só ele(a) verá." className="mt-1 w-full rounded border bg-white px-3 py-2 text-sm" />
        </label>
        <button className="w-full rounded bg-emerald-700 px-4 py-3 text-white">Marcar como feita</button>
      </form>
    </div>
  );
}
