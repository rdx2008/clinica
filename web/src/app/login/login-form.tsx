"use client";

import { useActionState } from "react";
import { loginAction, type FormState } from "@/app/actions/auth";

const initial: FormState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        E-mail
        <input name="email" type="email" required autoComplete="username" className="rounded border px-3 py-2" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Senha
        <input name="password" type="password" required autoComplete="current-password" className="rounded border px-3 py-2" />
      </label>
      {state.needsCode && (
        <label className="flex flex-col gap-1 text-sm">
          Código do aplicativo autenticador
          <input
            name="code"
            inputMode="numeric"
            pattern="[0-9 ]{6,7}"
            maxLength={7}
            required
            autoFocus
            autoComplete="one-time-code"
            className="rounded border px-3 py-2"
          />
        </label>
      )}
      {state.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className="rounded bg-emerald-700 px-3 py-2 text-white disabled:opacity-60">
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
