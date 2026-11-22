"use client";

import Link from "next/link";
import { importPatientsAction, type ImportState } from "@/app/actions/patients-admin";
import { useKeptActionState } from "@/components/use-kept-form";

const initial: ImportState = {};

export function ImportForm() {
  const [state, onSubmit, pending] = useKeptActionState(importPatientsAction, initial);

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-3 rounded border p-4">
        <label className="block text-sm">
          Arquivo CSV
          <input type="file" name="file" accept=".csv,text/csv,text/plain" required className="mt-1 block w-full rounded border bg-white p-2 text-sm" />
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="consent" required className="mt-1" />
          Confirmo que a clínica possui o consentimento dos titulares para tratar esses dados (LGPD).
        </label>
        {state.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}
        <button disabled={pending} className="rounded bg-emerald-700 px-4 py-2 text-sm text-white disabled:opacity-60">
          {pending ? "Importando…" : "Importar"}
        </button>
      </form>

      {state.done && (
        <section className="space-y-3 rounded border p-4 text-sm">
          <p className="text-base font-medium text-emerald-800">{state.created} paciente(s) importado(s).</p>
          {!!state.skipped?.length && (
            <div>
              <p className="font-medium">Ignorados por já existirem ({state.skipped.length}{state.skipped.length === 50 ? "+" : ""}):</p>
              <ul className="mt-1 list-disc pl-5 text-zinc-600">
                {state.skipped.map((s) => <li key={s.line}>linha {s.line}: {s.reason}</li>)}
              </ul>
            </div>
          )}
          {!!state.errors?.length && (
            <div>
              <p className="font-medium text-red-700">Linhas com erro, não importadas ({state.errors.length}{state.errors.length === 50 ? "+" : ""}):</p>
              <ul className="mt-1 list-disc pl-5 text-zinc-600">
                {state.errors.map((s) => <li key={s.line}>linha {s.line}: {s.reason}</li>)}
              </ul>
              <p className="mt-1 text-xs text-zinc-500">Corrija essas linhas na planilha e importe de novo: as já importadas serão ignoradas.</p>
            </div>
          )}
          <Link href="/pacientes" className="inline-block rounded border px-3 py-2">Ver pacientes</Link>
        </section>
      )}
    </div>
  );
}
