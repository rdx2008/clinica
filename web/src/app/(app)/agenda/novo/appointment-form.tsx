"use client";

import { useState } from "react";
import type { AppointmentFormState } from "@/app/actions/agenda";
import { useKeptActionState } from "@/components/use-kept-form";

const input = "w-full rounded border px-3 py-2 text-sm";

export function AppointmentForm({
  action,
  patients,
  professionals,
  services,
  rooms,
  insurances,
  defaults,
  idempotencyKey,
  lockProfessional,
}: {
  insurances: { id: string; patientId: string; label: string }[];
  action: (prev: AppointmentFormState, fd: FormData) => Promise<AppointmentFormState>;
  patients: { id: string; fullName: string }[];
  professionals: { id: string; name: string }[];
  services: { id: string; name: string; durationMin: number; modality: string }[];
  rooms: { id: string; name: string }[];
  defaults: { date: string; time: string; professionalId: string; patientId: string };
  idempotencyKey: string;
  lockProfessional: boolean;
}) {
  const [state, onSubmit, pending] = useKeptActionState(action, {});
  const [patientId, setPatientId] = useState(defaults.patientId);
  const options = insurances.filter((i) => i.patientId === patientId);
  return (
    <form method="post" onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {state.error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}

      <label className="block text-sm">Paciente
        <select name="patientId" required value={patientId} onChange={(e) => setPatientId(e.target.value)} className={input}>
          <option value="" disabled>Selecione…</option>
          {patients.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
        </select>
      </label>
      {options.length > 0 && (
        <label className="block text-sm">Forma de atendimento
          <select name="insuranceId" key={patientId} defaultValue="" className={input}>
            <option value="">Particular</option>
            {options.map((i) => <option key={i.id} value={i.id}>Convênio: {i.label}</option>)}
          </select>
        </label>
      )}
      <label className="block text-sm">Profissional
        <select name="professionalId" required defaultValue={defaults.professionalId} disabled={lockProfessional} className={input}>
          {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {lockProfessional && <input type="hidden" name="professionalId" value={defaults.professionalId} />}
      </label>
      <label className="block text-sm">Serviço
        <select name="serviceId" required defaultValue="" className={input}>
          <option value="" disabled>Selecione…</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>{s.name} · {s.durationMin} min · {s.modality === "ONLINE" ? "online" : "presencial"}</option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">Data
          <input type="date" name="date" required defaultValue={defaults.date} className={input} />
        </label>
        <label className="block text-sm">Horário
          <input type="time" name="time" required defaultValue={defaults.time} className={input} />
        </label>
      </div>
      {rooms.length > 0 && (
        <label className="block text-sm">Sala (opcional)
          <select name="roomId" defaultValue="" className={input}>
            <option value="">Sem sala</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
      )}
      <label className="block text-sm">Repetir semanalmente (número de sessões)
        <input type="number" name="repeat" min={1} max={52} defaultValue={1} className={input} />
        <span className="text-xs text-zinc-500">1 = sessão única. Se qualquer data da série estiver ocupada, nenhuma é criada.</span>
      </label>
      <label className="block text-sm">Link da videochamada (só serviços online; vazio usa o link padrão do profissional)
        <input type="url" name="meetingUrl" placeholder="https://…" className={input} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="outside" /> Encaixe (permitir fora do horário de atendimento do profissional)
      </label>
      <button disabled={pending} className="rounded bg-emerald-700 px-4 py-2 text-sm text-white disabled:opacity-60">
        {pending ? "Salvando…" : "Agendar"}
      </button>
    </form>
  );
}
