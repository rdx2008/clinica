"use client";

import { useActionState } from "react";
import { enableMfaAction, type FormState } from "@/app/actions/auth";
import { BackupCodesView } from "@/components/backup-codes-view";

const initial: FormState = {};

export function MfaForm({ secret }: { secret: string }) {
  const [state, action, pending] = useActionState(enableMfaAction, initial);

  if (state.backupCodes) {
    return <BackupCodesView codes={state.backupCodes} continueHref="/dashboard" />;
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="secret" value={secret} />
      <label className="flex flex-col gap-1 text-sm">
        Código de 6 dígitos
        <input
          name="code"
          inputMode="numeric"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          required
          autoComplete="one-time-code"
          className="rounded border px-3 py-2"
        />
      </label>
      {state.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      <button disabled={pending} className="rounded bg-emerald-700 px-3 py-2 text-white disabled:opacity-60">
        {pending ? "Verificando…" : "Ativar"}
      </button>
    </form>
  );
}
