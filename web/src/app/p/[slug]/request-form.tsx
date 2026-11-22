"use client";

import { useActionState } from "react";
import { requestPortalLinkAction } from "@/app/actions/portal";
import type { FormState } from "@/app/actions/auth";

const initial: FormState = {};

export function RequestLinkForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState(requestPortalLinkAction, initial);
  if (state.ok) return <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{state.ok}</p>;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <label className="flex flex-col gap-1 text-sm">
        Seu e-mail
        <input name="email" type="email" required autoComplete="email" className="rounded border px-3 py-2" />
      </label>
      {state.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className="w-full rounded bg-emerald-700 px-3 py-2 text-white disabled:opacity-60">{pending ? "Enviando…" : "Enviar link de acesso"}</button>
    </form>
  );
}
