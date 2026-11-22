"use client";

import { useActionState } from "react";
import { regenerateBackupCodesAction } from "@/app/actions/users";
import type { FormState } from "@/app/actions/auth";
import { BackupCodesView } from "@/components/backup-codes-view";

const initial: FormState = {};

export function RegenForm() {
  const [state, action, pending] = useActionState(regenerateBackupCodesAction, initial);
  if (state.backupCodes) return <BackupCodesView codes={state.backupCodes} />;
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label className="text-sm">
        Confirme sua senha
        <input name="password" type="password" required autoComplete="current-password" className="mt-1 block rounded border px-3 py-2 text-sm" />
      </label>
      <button disabled={pending} className="rounded border px-3 py-2 text-sm disabled:opacity-60">
        {pending ? "Gerando…" : "Gerar novos códigos"}
      </button>
      {state.error && <p role="alert" className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
