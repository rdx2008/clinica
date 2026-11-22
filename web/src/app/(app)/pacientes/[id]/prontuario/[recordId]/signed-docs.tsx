"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteAttachmentAction } from "@/app/actions/records";

export type SignatureView = { signer: string | null; issuer: string | null; notAfter: string | null; icpBrasil: boolean; coversEnd: boolean };
export type SignedItem = { id: string; name: string; size: string; sha256: string | null; when: string; intact: boolean; signatures: SignatureView[] };

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");

export function SignedDocs({ recordId, items, canUpload, canRemove }: { recordId: string; items: SignedItem[]; canUpload: boolean; canRemove: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("recordId", recordId);
    fd.set("file", file);
    try {
      const res = await fetch("/api/anexos/assinado", { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(body.error ?? "Falha no envio.");
    } catch {
      setError("Falha de conexão.");
    }
    setBusy(false);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <section className="space-y-3 rounded border p-4">
      <h2>Documento assinado ({items.length})</h2>
      <p className="text-xs text-zinc-500">
        Assine o PDF por fora (certificado digital ICP-Brasil ou gov.br) e anexe aqui. O sistema guarda o arquivo criptografado, registra a impressão digital (SHA-256) e mostra quem assinou.
      </p>
      {items.length === 0 && <p className="text-sm text-zinc-500">Nenhum documento assinado anexado.</p>}

      <ul className="space-y-2 text-sm">
        {items.map((d) => (
          <li key={d.id} className="space-y-2 rounded-lg border bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <a href={`/api/anexos/${d.id}`} target="_blank" rel="noopener noreferrer" className="font-medium text-emerald-800 underline">{d.name}</a>
              <span className="flex items-center gap-2 text-xs text-zinc-500">
                {d.size} · anexado em {d.when}
                {canRemove && (
                  <form action={deleteAttachmentAction}>
                    <input type="hidden" name="id" value={d.id} />
                    <button className="rounded border px-2 py-1 text-xs text-red-700">Remover</button>
                  </form>
                )}
              </span>
            </div>
            <ul className="space-y-1">
              {d.signatures.map((s, i) => (
                <li key={i} className="rounded bg-emerald-50 p-2 text-xs text-emerald-950">
                  <strong>{s.signer ?? "Signatário não identificado"}</strong>
                  {s.issuer && <> · emitido por {s.issuer}</>}
                  {s.icpBrasil && <span className="ml-1 rounded bg-emerald-200 px-1.5 py-0.5">ICP-Brasil</span>}
                  <span className="block text-emerald-900/80">certificado válido até {fmtDate(s.notAfter)}</span>
                </li>
              ))}
            </ul>
            {!d.intact && (
              <p role="alert" className="rounded bg-amber-50 p-2 text-xs text-amber-900">
                O arquivo tem conteúdo depois da última assinatura. Confira no validador antes de usar.
              </p>
            )}
            {d.sha256 && <p className="break-all font-mono text-[11px] text-zinc-500">SHA-256: {d.sha256}</p>}
          </li>
        ))}
      </ul>

      {items.length > 0 && (
        <p className="text-xs text-zinc-500">
          Este sistema lê os dados da assinatura, mas não valida a cadeia de confiança. Para validar oficialmente, use o{" "}
          <a href="https://validar.iti.gov.br" target="_blank" rel="noopener noreferrer" className="underline">validador do ITI</a>.
        </p>
      )}

      {canUpload && (
        <div className="space-y-2">
          <label className="inline-block cursor-pointer rounded border bg-white px-3 py-2 text-sm shadow-sm hover:bg-zinc-50">
            {busy ? "Enviando…" : "Anexar documento assinado (PDF)"}
            <input ref={input} type="file" disabled={busy} accept=".pdf,application/pdf" className="sr-only" onChange={(e) => upload(e.target.files)} />
          </label>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </section>
  );
}
