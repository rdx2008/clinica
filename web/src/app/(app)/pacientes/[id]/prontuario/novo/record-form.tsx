"use client";

import { useState } from "react";
import { createRecordAction } from "@/app/actions/records";

export type TemplateOption = { key: string; name: string; type: string; content: string; own?: boolean };

const input = "w-full rounded border px-3 py-2 text-sm";

export function RecordForm({
  patientId,
  typeLabels,
  appointments,
  templates,
  defaultAppointment,
  defaultType,
  max,
}: {
  patientId: string;
  typeLabels: Record<string, string>;
  appointments: { id: string; label: string }[];
  templates: TemplateOption[];
  defaultAppointment: string;
  defaultType: string;
  max: number;
}) {
  const [type, setType] = useState(defaultType);
  const [content, setContent] = useState("");

  const applyTemplate = (key: string) => {
    const t = templates.find((x) => x.key === key);
    if (!t) return;
    if (content.trim() && !window.confirm("Substituir o texto atual pelo modelo?")) return;
    setType(t.type);
    setContent(t.content);
  };

  return (
    <form action={createRecordAction} className="space-y-3">
      <input type="hidden" name="patientId" value={patientId} />

      {templates.length > 0 && (
        <label className="block text-sm">Começar de um modelo (opcional)
          <select className={input} defaultValue="" onChange={(e) => applyTemplate(e.target.value)}>
            <option value="">Texto em branco</option>
            {templates.map((t) => (
              <option key={t.key} value={t.key}>{t.name}{t.own ? " (meu modelo)" : ""}</option>
            ))}
          </select>
        </label>
      )}

      <label className="block text-sm">Tipo
        <select name="type" value={type} onChange={(e) => setType(e.target.value)} className={input}>
          {Object.entries(typeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="block text-sm">Atendimento relacionado (opcional)
        <select name="appointmentId" defaultValue={defaultAppointment} className={input}>
          <option value="">Nenhum</option>
          {appointments.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
      </label>
      <label className="block text-sm">Conteúdo
        <textarea name="content" required rows={16} maxLength={max} value={content} onChange={(e) => setContent(e.target.value)} className={input} />
      </label>
      <p className="text-xs text-zinc-500">Salvo como rascunho e criptografado. Depois de aprovado, o registro não pode mais ser alterado.</p>
      <button className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">Salvar rascunho</button>
    </form>
  );
}
