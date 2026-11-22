"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { globalSearchAction, type SearchHit } from "@/app/actions/search";

// Busca global: abre com Ctrl+K (ou Cmd+K) ou pelo botão. Setas navegam, Enter abre, Esc fecha.
export function CommandPalette({ variant = "sidebar" }: { variant?: "sidebar" | "bar" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const my = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const res = await globalSearchAction(q);
        if (my === seq.current) {
          setHits(res);
          setActive(0);
        }
      } catch {
        if (my === seq.current) setHits([]);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q, open]);

  const go = (h: SearchHit) => {
    setOpen(false);
    setQ("");
    router.push(h.href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buscar (Ctrl+K)"
        className={
          variant === "sidebar"
            ? "flex w-full items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-left text-sm text-white/70 hover:bg-white/15"
            : "flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white"
        }
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-[18px] w-[18px]" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        {variant === "sidebar" && (
          <>
            <span className="flex-1">Buscar…</span>
            <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60">Ctrl K</kbd>
          </>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh]" onMouseDown={() => setOpen(false)}>
          <div
            role="dialog"
            aria-label="Busca global"
            className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, hits.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === "Enter" && hits[active]) go(hits[active]);
              }}
              placeholder="Buscar paciente (nome ou telefone) ou página…"
              className="w-full border-0 border-b px-4 py-3.5 text-base outline-none"
              style={{ boxShadow: "none", borderRadius: 0 }}
            />
            <ul className="max-h-[50vh] overflow-y-auto py-1 text-sm">
              {hits.length === 0 && <li className="px-4 py-6 text-center text-zinc-500">Nada encontrado.</li>}
              {hits.map((h, i) => (
                <li key={`${h.kind}-${h.href}`}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(h)}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left ${i === active ? "bg-emerald-50" : ""}`}
                  >
                    <span className="min-w-0 truncate">
                      <span className="mr-2 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500">{h.kind}</span>
                      {h.label}
                    </span>
                    {h.hint && <span className="shrink-0 text-xs text-zinc-500">{h.hint}</span>}
                  </button>
                </li>
              ))}
            </ul>
            <p className="border-t bg-zinc-50 px-4 py-2 text-[11px] text-zinc-500">↑↓ navegar · Enter abrir · Esc fechar</p>
          </div>
        </div>
      )}
    </>
  );
}
