"use client";

import { useActionState } from "react";
import { setupAction, type FormState } from "@/app/actions/auth";

const initial: FormState = {};

export function SetupForm() {
  const [state, action, pending] = useActionState(setupAction, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Nome da clínica
        <input name="clinicName" required className="rounded border px-3 py-2" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Seu nome
        <input name="name" required autoComplete="name" className="rounded border px-3 py-2" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        E-mail
        <input name="email" type="email" required autoComplete="username" className="rounded border px-3 py-2" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Senha (mínimo 12 caracteres)
        <input name="password" type="password" required minLength={12} autoComplete="new-password" className="rounded border px-3 py-2" />
      </label>
      {state.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className="rounded bg-emerald-700 px-3 py-2 text-white disabled:opacity-60">
        {pending ? "Criando…" : "Criar clínica e administrador"}
      </button>
    </form>
  );
}
