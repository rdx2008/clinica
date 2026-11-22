import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { formatPhoneBR, onlyDigits } from "@/lib/br";
import { windowOpen } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const FILTERS = [
  ["", "Todas"],
  ["equipe", "Aguardando a equipe"],
  ["minhas", "Minhas"],
  ["livres", "Sem responsável"],
  ["naolidas", "Não lidas"],
] as const;

export default async function WhatsappInbox({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  const user = await requireRole("ADMIN", "RECEPCAO");
  const sp = await searchParams;
  const f = sp.f ?? "";
  const term = (sp.q ?? "").trim();
  const digits = onlyDigits(term);

  const where = {
    clinicId: user.clinicId,
    ...(f === "equipe" ? { aiState: "TRANSFERIDA" as const } : {}),
    ...(f === "minhas" ? { assignedTo: user.id } : {}),
    ...(f === "livres" ? { assignedTo: null } : {}),
    ...(f === "naolidas" ? { unread: { gt: 0 } } : {}),
    ...(term
      ? {
          OR: [
            { patient: { fullName: { contains: term, mode: "insensitive" as const } } },
            ...(digits.length >= 4 ? [{ waContact: { contains: digits } }] : []),
          ],
        }
      : {}),
  };

  const [account, conversations, staff] = await Promise.all([
    db.waAccount.findFirst({ where: { clinicId: user.clinicId }, select: { status: true } }),
    db.waConversation.findMany({ where, orderBy: { lastMsgAt: "desc" }, take: 100, include: { patient: { select: { fullName: true } } } }),
    db.user.findMany({ where: { clinicId: user.clinicId, role: { in: ["ADMIN", "RECEPCAO"] } }, select: { id: true, name: true } }),
  ]);
  const staffName = new Map(staff.map((s) => [s.id, s.name.split(" ")[0]]));
  const link = (x: string) => `/whatsapp?${new URLSearchParams({ ...(x ? { f: x } : {}), ...(term ? { q: term } : {}) })}`;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl">WhatsApp</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/whatsapp/nova" className="rounded bg-emerald-700 px-3 py-2 text-sm text-white">Nova mensagem</Link>
          <Link href="/whatsapp/respostas" className="rounded border px-3 py-2 text-sm">Respostas rápidas</Link>
          {user.role === "ADMIN" && (
            <>
              <Link href="/whatsapp/ia" className="rounded border px-3 py-2 text-sm">IA</Link>
              <Link href="/whatsapp/automacoes" className="rounded border px-3 py-2 text-sm">Modelos e lembretes</Link>
              <Link href="/whatsapp/config" className="rounded border px-3 py-2 text-sm">Configuração</Link>
            </>
          )}
        </div>
      </div>

      {!account && (
        <p className="rounded border p-4 text-sm text-zinc-600">
          WhatsApp ainda não configurado.{" "}
          {user.role === "ADMIN" ? <Link href="/whatsapp/config" className="underline">Configurar agora</Link> : "Peça ao administrador."}
        </p>
      )}

      <form className="flex gap-2">
        {f && <input type="hidden" name="f" value={f} />}
        <input name="q" defaultValue={term} placeholder="Buscar por paciente ou telefone" className="flex-1 rounded border px-3 py-2 text-sm" />
        <button className="rounded border px-3 py-2 text-sm">Buscar</button>
      </form>

      <div className="flex flex-wrap gap-1.5 text-xs">
        {FILTERS.map(([k, label]) => (
          <Link key={k} href={link(k)} className={`rounded-full border px-2.5 py-1 ${f === k ? "bg-zinc-800 text-white" : "bg-white"}`}>{label}</Link>
        ))}
      </div>

      <ul className="divide-y rounded border text-sm">
        {conversations.length === 0 && <li className="p-4 text-zinc-500">Nenhuma conversa neste filtro.</li>}
        {conversations.map((c) => (
          <li key={c.id}>
            <Link href={`/whatsapp/${c.id}`} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-zinc-50">
              <span className="min-w-0">
                <span className={`${c.unread > 0 ? "font-semibold" : "font-medium"}`}>{c.patient?.fullName ?? formatPhoneBR(c.waContact)}</span>
                {!c.patient && <span className="ml-2 text-xs text-amber-700">não vinculado a paciente</span>}
                {c.aiState === "TRANSFERIDA" && <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">aguardando a equipe</span>}
                {c.assignedTo && <span className="ml-2 rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-800">{staffName.get(c.assignedTo) ?? "atribuída"}</span>}
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-zinc-500">
                {c.lastMsgAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}
                {windowOpen(c.windowExpiresAt) && <span className="text-emerald-700">· janela aberta</span>}
                {c.unread > 0 && <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-[11px] font-semibold text-white">{c.unread}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
