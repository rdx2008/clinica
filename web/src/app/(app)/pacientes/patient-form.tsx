"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { PatientFormState } from "@/app/actions/patients";

type Props = {
  action: (prev: PatientFormState, formData: FormData) => Promise<PatientFormState>;
  mode: "create" | "edit";
  initial?: {
    id: string;
    fullName: string;
    birthDate: string;
    phone: string;
    email: string;
    source: string;
    tags: string;
    hasCpf: boolean;
  };
};

const input = "rounded border px-3 py-2 text-sm";

export function PatientForm({ action, mode, initial }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="grid max-w-2xl gap-4 sm:grid-cols-2">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        Nome completo
        <input name="fullName" required defaultValue={initial?.fullName} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Data de nascimento
        <input name="birthDate" type="date" defaultValue={initial?.birthDate} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        CPF {initial?.hasCpf && <span className="text-xs text-zinc-500">(deixe em branco para manter)</span>}
        <input name="cpf" inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Telefone (WhatsApp)
        <input name="phone" inputMode="tel" defaultValue={initial?.phone} placeholder="(11) 91234-5678" className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        E-mail
        <input name="email" type="email" defaultValue={initial?.email} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Como conheceu a clínica
        <input name="source" defaultValue={initial?.source} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Etiquetas (separadas por vírgula)
        <input name="tags" defaultValue={initial?.tags} className={input} />
      </label>

      {mode === "create" && (
        <fieldset className="flex flex-col gap-2 text-sm sm:col-span-2">
          <label className="flex items-start gap-2">
            <input type="checkbox" name="dataConsent" required className="mt-1" />
            O paciente (ou responsável) consentiu com o tratamento de seus dados para o atendimento.
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="whatsappOptin" className="mt-1" />
            O paciente autorizou contato por WhatsApp (lembretes e confirmações).
          </label>
        </fieldset>
      )}

      {state.duplicates && (
        <div role="alert" className="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-2">
          <p className="font-medium">{state.error}</p>
          <ul className="mt-1 list-disc pl-5">
            {state.duplicates.map((d) => (
              <li key={d.id}>
                <Link href={`/pacientes/${d.id}`} className="underline" target="_blank">{d.fullName}</Link> — {d.reason}
              </li>
            ))}
          </ul>
          <label className="mt-2 flex items-center gap-2">
            <input type="checkbox" name="confirmDuplicate" /> É outra pessoa — salvar mesmo assim
          </label>
        </div>
      )}
      {state.error && !state.duplicates && (
        <p role="alert" className="text-sm text-red-600 sm:col-span-2">{state.error}</p>
      )}

      <div className="flex gap-3 sm:col-span-2">
        <button disabled={pending} className="rounded bg-emerald-700 px-4 py-2 text-sm text-white disabled:opacity-60">
          {pending ? "Salvando…" : mode === "create" ? "Cadastrar paciente" : "Salvar alterações"}
        </button>
        <Link href={initial ? `/pacientes/${initial.id}` : "/pacientes"} className="rounded border px-4 py-2 text-sm">Cancelar</Link>
      </div>
    </form>
  );
}
