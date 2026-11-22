"use client";

import { useActionState, useState } from "react";
import { createResetLinkAction } from "@/app/actions/users";
import type { FormState } from "@/app/actions/auth";

const initial: FormState = {};

export function ResetLink({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(createResetLinkAction, initial);
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      <form action={action}>
        <input type="hidden" name="userId" value={userId} />
        <button disabled={pending} className="rounded border px-2 py-1 text-xs">{pending ? "Gerando…" : "Gerar link de redefinição"}</button>
      </form>
      {state.error && <p role="alert" className="text-xs text-red-600">{state.error}</p>}
      {state.link && (
        <div className="space-y-1 rounded-lg bg-zinc-100 p-2 text-xs">
          <p className="text-zinc-600">Válido por 1 hora, uso único. Envie ao usuário por um canal seguro:</p>
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
