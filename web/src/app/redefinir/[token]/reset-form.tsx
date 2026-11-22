"use client";

import { useActionState } from "react";
import { redeemResetAction } from "@/app/actions/users";
import type { FormState } from "@/app/actions/auth";

const initial: FormState = {};

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(redeemResetAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <label className="flex flex-col gap-1 text-sm">
        Nova senha
        <input name="password" type="password" required minLength={12} autoComplete="new-password" className="rounded border px-3 py-2" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Repita a nova senha
        <input name="confirm" type="password" required minLength={12} autoComplete="new-password" className="rounded border px-3 py-2" />
      </label>
      {state.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className="rounded bg-emerald-700 px-3 py-2 text-white disabled:opacity-60">
        {pending ? "Salvando…" : "Salvar nova senha"}
      </button>
    </form>
  );
}
