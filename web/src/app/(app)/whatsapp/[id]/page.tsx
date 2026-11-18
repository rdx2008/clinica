import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { decryptField } from "@/lib/crypto";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";
import { formatPhoneBR } from "@/lib/br";
import { windowOpen } from "@/lib/whatsapp";
import { sendReplyAction, setAiStateAction } from "@/app/actions/whatsapp";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { RECEBIDA: "", ENVIADA: "enviada", ENTREGUE: "entregue", LIDA: "lida", FALHOU: "falhou" };

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const user = await requireRole("ADMIN", "RECEPCAO");
  const { id } = await params;
  const { erro } = await searchParams;

  const conv = await db.waConversation.findFirst({
    where: { id, clinicId: user.clinicId },
    include: { patient: { select: { id: true, fullName: true } }, messages: { orderBy: { createdAt: "asc" }, take: 200 } },
  });
  if (!conv) notFound();
  await audit({ clinicId: user.clinicId, userId: user.id, action: "WHATSAPP_CONVERSA_VISUALIZADA", entity: "WaConversation", entityId: conv.id });

  const open = windowOpen(conv.windowExpiresAt);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/whatsapp" className="text-xs text-zinc-500 underline">← Conversas</Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{conv.patient?.fullName ?? formatPhoneBR(conv.waContact)}</h1>
          <p className="text-xs text-zinc-500">
            {formatPhoneBR(conv.waContact)} · IA: {conv.aiState === "ATIVA" ? "ativa" : "pausada (atendimento humano)"}
            {conv.patient && <> · <Link href={`/pacientes/${conv.patient.id}`} className="underline">ficha</Link></>}
          </p>
        </div>
        <form action={setAiStateAction}>
          <input type="hidden" name="id" value={conv.id} />
          <input type="hidden" name="state" value={conv.aiState === "ATIVA" ? "PAUSADA" : "ATIVA"} />
          <button className="rounded border px-2 py-1 text-xs">{conv.aiState === "ATIVA" ? "Assumir conversa" : "Devolver à IA"}</button>
        </form>
      </div>

      {erro && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{erro}</p>}

      <ul className="space-y-2 rounded border p-3">
        {conv.messages.length === 0 && <li className="text-sm text-zinc-500">Sem mensagens.</li>}
        {conv.messages.map((m) => (
          <li key={m.id} className={`flex ${m.direction === "SAIDA" ? "justify-end" : ""}`}>
            <div className={`max-w-[80%] whitespace-pre-wrap rounded px-3 py-2 text-sm ${m.direction === "SAIDA" ? "bg-emerald-100" : "bg-zinc-100"}`}>
              {m.body ? decryptField(m.body) : `[${m.type}]`}
              <p className="mt-1 text-[10px] text-zinc-500">
                {m.createdAt.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}
                {STATUS[m.status] ? ` · ${STATUS[m.status]}` : ""}
                {m.error ? ` · ${m.error}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {open ? (
        <form action={sendReplyAction} className="flex gap-2">
          <input type="hidden" name="id" value={conv.id} />
          <textarea name="body" required rows={2} maxLength={2000} placeholder="Escreva a resposta…" className="flex-1 rounded border px-3 py-2 text-sm" />
          <button className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">Enviar</button>
        </form>
      ) : (
        <p className="rounded border p-3 text-sm text-zinc-600">
          Janela de 24h encerrada. Só é possível responder após uma nova mensagem do paciente (mensagens modelo ainda não estão disponíveis).
        </p>
      )}
    </div>
  );
}
