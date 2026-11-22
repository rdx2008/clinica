"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";

export type ChatItem = {
  id: string;
  name: string;
  linked: boolean;
  preview: string;
  previewOut: boolean;
  at: string; // ISO
  unread: number;
  transferred: boolean;
  assignedTo: string | null;
  assignedName: string | null;
  windowOpen: boolean;
};

const FILTERS = [
  ["todas", "Todas"],
  ["equipe", "Aguardando"],
  ["minhas", "Minhas"],
  ["livres", "Sem responsável"],
  ["naolidas", "Não lidas"],
] as const;

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const same = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) === now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return same
    ? d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "#";
}

// Visual de chat: lista de conversas à esquerda, conversa aberta à direita. No celular alterna entre as duas.
export function ChatShell({
  items,
  me,
  canConfigure,
  configured,
  children,
}: {
  items: ChatItem[];
  me: string;
  canConfigure: boolean;
  configured: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>("todas");

  const isList = pathname === "/whatsapp";
  const activeId = pathname.startsWith("/whatsapp/") ? pathname.split("/")[2] : null;

  // Ao abrir uma conversa, atualiza a lista (zera o contador de não lidas).
  useEffect(() => {
    router.refresh();
  }, [activeId, router]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter((c) => {
      if (term && !c.name.toLowerCase().includes(term) && !c.preview.toLowerCase().includes(term)) return false;
      if (filter === "equipe") return c.transferred;
      if (filter === "minhas") return c.assignedTo === me;
      if (filter === "livres") return !c.assignedTo;
      if (filter === "naolidas") return c.unread > 0;
      return true;
    });
  }, [items, q, filter, me]);

  return (
    <div className="-mx-4 -my-6 flex h-[calc(100dvh-3.75rem)] overflow-hidden bg-white sm:-mx-6 lg:-mx-10 lg:-my-9 lg:h-screen">
      <AutoRefresh intervalMs={12000} />

      {/* lista de conversas */}
      <aside className={`${isList ? "flex" : "hidden lg:flex"} w-full flex-col border-r lg:w-[22rem] lg:shrink-0`}>
        <div className="space-y-3 border-b p-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-xl">Conversas</h1>
            <div className="flex items-center gap-1.5">
              <Link href="/whatsapp/nova" className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white">Nova mensagem</Link>
              {canConfigure && (
                <Link href="/configuracoes/whatsapp" title="Configurações do WhatsApp" aria-label="Configurações do WhatsApp" className="flex h-8 w-8 items-center justify-center rounded border bg-white text-zinc-600 hover:bg-zinc-50">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                    <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                    <path d="M19.4 12a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z" />
                  </svg>
                </Link>
              )}
            </div>
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar conversa"
            className="w-full rounded-lg border px-3 py-2 text-sm"
            aria-label="Buscar conversa"
          />
          <div className="flex flex-wrap gap-1">
            {FILTERS.map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={`rounded-full border px-2.5 py-1 text-[11px] ${filter === k ? "border-zinc-800 bg-zinc-800 text-white" : "bg-white"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {!configured && (
          <p className="border-b bg-amber-50 p-3 text-xs text-amber-900">
            WhatsApp ainda não configurado. {canConfigure ? <Link href="/configuracoes/whatsapp/conexao" className="underline">Configurar agora</Link> : "Peça ao administrador."}
          </p>
        )}

        <ul className="flex-1 divide-y overflow-y-auto">
          {shown.length === 0 && <li className="p-6 text-center text-sm text-zinc-500">Nenhuma conversa{filter !== "todas" || q ? " neste filtro" : " ainda"}.</li>}
          {shown.map((c) => (
            <li key={c.id}>
              <Link
                href={`/whatsapp/${c.id}`}
                aria-current={activeId === c.id ? "page" : undefined}
                className={`flex gap-3 px-3 py-3 hover:bg-zinc-50 ${activeId === c.id ? "bg-emerald-50 hover:bg-emerald-50" : ""}`}
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${c.linked ? "bg-emerald-100 text-emerald-800" : "bg-zinc-200 text-zinc-600"}`}>
                  {initials(c.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-sm ${c.unread > 0 ? "font-semibold" : "font-medium"}`}>{c.name}</span>
                    <span className={`shrink-0 text-[11px] ${c.unread > 0 ? "font-semibold text-emerald-700" : "text-zinc-500"}`}>{fmtTime(c.at)}</span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-zinc-500">{c.previewOut && "Você: "}{c.preview || "—"}</span>
                    {c.unread > 0 && <span className="shrink-0 rounded-full bg-emerald-700 px-1.5 text-[11px] font-semibold text-white">{c.unread}</span>}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {c.transferred && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700">aguardando a equipe</span>}
                    {c.assignedName && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-800">{c.assignedName}</span>}
                    {!c.linked && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-800">sem paciente</span>}
                    {c.windowOpen && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-800">janela aberta</span>}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </aside>

      {/* conversa aberta */}
      <section className={`${isList ? "hidden lg:flex" : "flex"} relative min-w-0 flex-1 flex-col bg-zinc-50`}>
        {!isList && (
          <Link href="/whatsapp" className="border-b bg-white px-3 py-2 text-sm text-emerald-800 lg:hidden">← Conversas</Link>
        )}
        <div className="relative min-h-0 flex-1">
          <div className="absolute inset-0 overflow-y-auto">{children}</div>
        </div>
      </section>
    </div>
  );
}
