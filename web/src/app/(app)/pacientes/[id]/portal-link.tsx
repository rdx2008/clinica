"use client";

import { useActionState, useState } from "react";
import { createPortalLinkForPatientAction } from "@/app/actions/portal";
import type { FormState } from "@/app/actions/auth";

const initial: FormState = {};

export function PortalLink({ patientId }: { patientId: string }) {
  const [state, action, pending] = useActionState(createPortalLinkForPatientAction, initial);
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      <form action={action}>
        <input type="hidden" name="patientId" value={patientId} />
        <button disabled={pending} className="rounded border px-3 py-2 text-sm">{pending ? "Gerando…" : "Gerar link do portal"}</button>
      </form>
      {state.error && <p role="alert" className="text-xs text-red-600">{state.error}</p>}
      {state.link && (
        <div className="space-y-1 rounded-lg bg-zinc-100 p-2 text-xs">
          <p className="text-zinc-600">Válido por 24 horas, uso único. Envie ao paciente por um canal seguro:</p>
          <p className="break-all font-mono">{state.link}</p>
          <button
            type="button"
            className="rounded border bg-white px-2 py-1"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(state.link!);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Copiado ✓" : "Copiar link"}
          </button>
        </div>
      )}
    </div>
  );
}
