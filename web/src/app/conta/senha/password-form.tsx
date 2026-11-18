"use client";

import { useActionState } from "react";
import { changePasswordAction } from "@/app/actions/users";
import type { FormState } from "@/app/actions/auth";

const initial: FormState = {};

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Senha atual
        <input name="current" type="password" required autoComplete="current-password" className="rounded border px-3 py-2" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Nova senha (mínimo 12 caracteres)
        <input name="next" type="password" required minLength={12} autoComplete="new-password" className="rounded border px-3 py-2" />
      </label>
      {state.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className="rounded bg-emerald-700 px-3 py-2 text-white disabled:opacity-60">
        {pending ? "Salvando…" : "Salvar nova senha"}
      </button>
    </form>
  );
}
