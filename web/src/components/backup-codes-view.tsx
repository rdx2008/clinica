"use client";

import Link from "next/link";
import { useState } from "react";

export function BackupCodesView({ codes, continueHref }: { codes: string[]; continueHref?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-medium">Guarde estes códigos agora</p>
        <p className="mt-1">
          Cada código funciona uma única vez e substitui o aplicativo autenticador se você perder o celular. Eles não serão mostrados de novo.
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-2 font-mono text-base">
        {codes.map((c) => (
          <li key={c} className="rounded-lg bg-zinc-100 px-3 py-2 text-center tracking-wider">{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded border px-3 py-2 text-sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(codes.join("\n"));
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? "Copiado ✓" : "Copiar códigos"}
        </button>
        <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => window.print()}>
          Imprimir
        </button>
        {continueHref && (
          <Link href={continueHref} className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">
            Já guardei, continuar
          </Link>
        )}
      </div>
    </div>
  );
}
