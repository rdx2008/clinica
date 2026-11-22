"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteAttachmentAction } from "@/app/actions/records";

export type AttachmentItem = { id: string; name: string; mime: string; size: string };

export function Attachments({ recordId, items, canEdit }: { recordId: string; items: AttachmentItem[]; canEdit: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.set("recordId", recordId);
      fd.set("file", file);
      try {
        const res = await fetch("/api/anexos", { method: "POST", body: fd });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setError(`${file.name}: ${body.error ?? "falha no envio"}`);
          break;
        }
      } catch {
        setError(`${file.name}: falha de conexão`);
        break;
      }
    }
    setBusy(false);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <section className="space-y-3 rounded border p-4">
      <h2>Anexos ({items.length})</h2>
      {items.length === 0 && <p className="text-sm text-zinc-500">Nenhum arquivo anexado.</p>}

      <ul className="space-y-2 text-sm">
        {items.map((a) => (
          <li key={a.id} className="space-y-2 rounded-lg border bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <a href={`/api/anexos/${a.id}`} target="_blank" rel="noopener noreferrer" className="font-medium text-emerald-800 underline">
                {a.name}
              </a>
              <span className="flex items-center gap-2 text-xs text-zinc-500">
                {a.size}
                {canEdit && (
                  <form action={deleteAttachmentAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <button className="rounded border px-2 py-1 text-xs text-red-700">Remover</button>
                  </form>
                )}
              </span>
            </div>
            {a.mime.startsWith("image/") && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/anexos/${a.id}`} alt={a.name} className="max-h-64 rounded border" />
            )}
            {a.mime.startsWith("audio/") && <audio controls preload="none" src={`/api/anexos/${a.id}`} className="w-full" />}
          </li>
        ))}
      </ul>

      {canEdit && (
        <div className="space-y-2">
          <label className="inline-block cursor-pointer rounded border bg-white px-3 py-2 text-sm shadow-sm hover:bg-zinc-50">
            {busy ? "Enviando…" : "Anexar arquivo (PDF, imagem ou áudio)"}
            <input
              ref={input}
              type="file"
              multiple
              disabled={busy}
              accept=".pdf,.png,.jpg,.jpeg,.webp,.mp3,.m4a,.ogg,.wav,.webm,application/pdf,image/*,audio/*"
              className="sr-only"
              onChange={(e) => upload(e.target.files)}
            />
          </label>
          <p className="text-xs text-zinc-500">Até 10 MB por arquivo e 20 por registro. Os arquivos ficam criptografados. Só é possível anexar enquanto o registro é rascunho.</p>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </section>
  );
}
