import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { createQuickReplyAction, deleteQuickReplyAction } from "@/app/actions/whatsapp2";

export const dynamic = "force-dynamic";

const input = "w-full rounded border px-3 py-2 text-sm";

export default async function QuickRepliesPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const user = await requireRole("ADMIN", "RECEPCAO");
  const sp = await searchParams;
  const replies = await db.quickReply.findMany({ where: { clinicId: user.clinicId }, orderBy: { title: "asc" } });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/whatsapp" className="text-xs text-zinc-500 underline">← Conversas</Link>
      <div>
        <h1 className="text-2xl">Respostas rápidas</h1>
        <p className="text-sm text-zinc-600">Textos prontos que aparecem como botões ao responder uma conversa (ex.: endereço, formas de pagamento, orientações de chegada).</p>
      </div>
      {sp.erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}

      <ul className="divide-y rounded border text-sm">
        {replies.length === 0 && <li className="p-4 text-zinc-500">Nenhuma resposta cadastrada.</li>}
        {replies.map((r) => (
          <li key={r.id} className="flex items-start justify-between gap-3 p-3">
            <div>
              <p className="font-medium">{r.title}</p>
              <p className="whitespace-pre-wrap text-zinc-600">{r.body}</p>
            </div>
            <form action={deleteQuickReplyAction}>
              <input type="hidden" name="id" value={r.id} />
              <button className="rounded border px-2 py-1 text-xs">Remover</button>
            </form>
          </li>
        ))}
      </ul>

      <section className="space-y-3 rounded border p-4">
        <h2>Nova resposta</h2>
        <form action={createQuickReplyAction} className="space-y-3">
          <label className="block text-sm">Título (aparece no botão)
            <input name="title" required maxLength={40} className={input} />
          </label>
          <label className="block text-sm">Texto
            <textarea name="body" required rows={4} maxLength={1000} className={input} />
          </label>
          <button className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">Salvar</button>
        </form>
      </section>
    </div>
  );
}
