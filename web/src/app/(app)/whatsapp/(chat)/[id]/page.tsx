import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { decryptField } from "@/lib/crypto";
import { requireRole } from "@/lib/session";
import { audit } from "@/lib/audit";
import { formatPhoneBR } from "@/lib/br";
import { windowOpen } from "@/lib/whatsapp";
import { setAiStateAction } from "@/app/actions/whatsapp";
import { addNoteAction, assignConversationAction } from "@/app/actions/whatsapp2";
import { ScrollToBottom } from "@/components/scroll-to-bottom";
import { ReplyBox } from "./reply-box";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { RECEBIDA: "", ENVIADA: "enviada", ENTREGUE: "entregue", LIDA: "lida ✓✓", FALHOU: "falhou" };

function dayLabel(d: Date): string {
  const tz = "America/Sao_Paulo";
  const key = (x: Date) => x.toLocaleDateString("pt-BR", { timeZone: tz });
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400_000);
  if (key(d) === key(today)) return "Hoje";
  if (key(d) === key(yesterday)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { timeZone: tz, day: "2-digit", month: "long", year: "numeric" });
}

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
    include: {
      patient: { select: { id: true, fullName: true } },
      messages: { orderBy: { createdAt: "asc" }, take: 300 },
      notes: { orderBy: { createdAt: "asc" }, take: 50 },
    },
  });
  if (!conv) notFound();
  await audit({ clinicId: user.clinicId, userId: user.id, action: "WHATSAPP_CONVERSA_VISUALIZADA", entity: "WaConversation", entityId: conv.id });
  if (conv.unread > 0) await db.waConversation.update({ where: { id: conv.id }, data: { unread: 0 } });

  const [staff, quick] = await Promise.all([
    db.user.findMany({ where: { clinicId: user.clinicId, active: true, role: { in: ["ADMIN", "RECEPCAO"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.quickReply.findMany({ where: { clinicId: user.clinicId }, orderBy: { title: "asc" }, select: { id: true, title: true, body: true } }),
  ]);
  const staffName = new Map(staff.map((s) => [s.id, s.name]));
  const open = windowOpen(conv.windowExpiresAt);

  const items = [
    ...conv.messages.map((m) => ({ kind: "msg" as const, at: m.createdAt, m })),
    ...conv.notes.map((n) => ({ kind: "note" as const, at: n.createdAt, n })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  const title = conv.patient?.fullName ?? formatPhoneBR(conv.waContact);
  const labels = items.map((it) => dayLabel(it.at));

  return (
    <div className="flex h-full flex-col">
      {/* cabeçalho */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-white px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="truncate text-base">{title}</h2>
          <p className="truncate text-xs text-zinc-500">
            {formatPhoneBR(conv.waContact)} · IA {conv.aiState === "ATIVA" ? "ativa" : conv.aiState === "TRANSFERIDA" ? "transferida para a equipe" : "pausada"}
            {conv.patient && <> · <Link href={`/pacientes/${conv.patient.id}`} className="underline">ficha</Link></>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <form action={assignConversationAction} className="flex items-center gap-1">
            <input type="hidden" name="id" value={conv.id} />
            <select name="userId" defaultValue={conv.assignedTo ?? ""} className="rounded border px-2 py-1 text-xs" aria-label="Responsável">
              <option value="">Sem responsável</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button className="rounded border px-2 py-1 text-xs">Atribuir</button>
          </form>
          <form action={setAiStateAction}>
            <input type="hidden" name="id" value={conv.id} />
            <input type="hidden" name="state" value={conv.aiState === "ATIVA" ? "PAUSADA" : "ATIVA"} />
            <button className="rounded border px-2 py-1 text-xs">{conv.aiState === "ATIVA" ? "Assumir conversa" : "Devolver à IA"}</button>
          </form>
        </div>
      </header>

      {/* mensagens */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {erro && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
        {items.length === 0 && <p className="text-center text-sm text-zinc-500">Sem mensagens.</p>}
        <ul className="space-y-1.5">
          {items.map((it, i) => {
            const label = labels[i];
            const sep = i === 0 || label !== labels[i - 1];
            return (
              <li key={it.kind === "note" ? `n-${it.n.id}` : it.m.id}>
                {sep && (
                  <div className="my-3 flex justify-center">
                    <span className="rounded-full bg-white px-3 py-1 text-[11px] text-zinc-500 shadow-sm">{label}</span>
                  </div>
                )}
                {it.kind === "note" ? (
                  <div className="mx-auto max-w-[85%] rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <p className="whitespace-pre-wrap">{decryptField(it.n.body)}</p>
                    <p className="mt-1 text-[10px] text-amber-700">
                      Nota interna · {staffName.get(it.n.authorId)?.split(" ")[0] ?? "equipe"} ·{" "}
                      {it.n.createdAt.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                ) : (
                  <div className={`flex ${it.m.direction === "SAIDA" ? "justify-end" : ""}`}>
                    <div
                      className={`max-w-[78%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm shadow-sm ${
                        it.m.direction === "SAIDA" ? "rounded-br-sm bg-emerald-100" : "rounded-bl-sm bg-white"
                      }`}
                    >
                      {it.m.body ? decryptField(it.m.body) : `[${it.m.type}]`}
                      <p className="mt-1 text-right text-[10px] text-zinc-500">
                        {it.m.createdAt.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}
                        {it.m.direction === "SAIDA" && STATUS[it.m.status] ? ` · ${STATUS[it.m.status]}` : ""}
                        {it.m.error ? ` · ${it.m.error}` : ""}
                      </p>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <ScrollToBottom trigger={items.length} />
      </div>

      {/* digitação */}
      <footer className="space-y-2 border-t bg-white p-3">
        {open ? (
          <ReplyBox id={conv.id} quick={quick} />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-100 p-3 text-sm text-zinc-600">
            <span>Janela de 24h encerrada: só é possível enviar um modelo aprovado.</span>
            {conv.patient && <Link href={`/whatsapp/nova?patient=${conv.patient.id}`} className="rounded border bg-white px-3 py-1.5">Enviar modelo</Link>}
          </div>
        )}
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-zinc-600">Nota interna (só a equipe vê)</summary>
          <form action={addNoteAction} className="mt-2 flex gap-2">
            <input type="hidden" name="id" value={conv.id} />
            <input name="body" required maxLength={1000} placeholder="Ex.: paciente pediu retorno na sexta" className="flex-1 rounded border px-3 py-2 text-sm" />
            <button className="rounded border px-3 py-2 text-sm">Salvar nota</button>
          </form>
        </details>
        <p className="text-right text-[11px]">
          <Link href="/configuracoes/whatsapp/respostas" className="text-zinc-500 underline">Gerenciar respostas rápidas</Link>
        </p>
      </footer>
    </div>
  );
}
