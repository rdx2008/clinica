"use client";

import { useState } from "react";
import { loginAction, type FormState } from "@/app/actions/auth";
import { useKeptActionState } from "@/components/use-kept-form";

const initial: FormState = {};

export function LoginForm() {
  // O envio mantém os campos preenchidos: antes o e-mail e a senha sumiam quando o sistema pedia
  // o código do autenticador. A senha é controlada só para ser limpa quando está errada.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, onSubmit, pending] = useKeptActionState(async (prev: FormState, formData: FormData) => {
    const result = await loginAction(prev, formData);
    // Senha errada: limpa a senha. Pedido de código: mantém tudo para o paciente só digitar o código.
    if (result.error && !result.needsCode) setPassword("");
    return result;
  }, initial);

  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        E-mail
        <input name="email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded border px-3 py-2" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Senha
        <input name="password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded border px-3 py-2" />
      </label>
      {state.needsCode && (
        <label className="flex flex-col gap-1 text-sm">
          Código do aplicativo autenticador (ou código de backup)
          <input
            name="code"
            maxLength={12}
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
