import type { ScaleDef } from "@/lib/scales";

// Formulário de escala (itens com 4 opções). Usado pelo profissional (sessão) e pelo paciente (portal).
export function ScaleFields({ def }: { def: ScaleDef }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600">{def.period}</p>
      <ol className="space-y-3">
        {def.items.map((item, i) => (
          <li key={i} className="space-y-2 rounded-xl border bg-white p-3">
            <p className="text-sm font-medium">
              {i + 1}. {item}
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {def.options.map((o) => (
                <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm has-[:checked]:border-emerald-700 has-[:checked]:bg-emerald-50">
                  <input type="radio" name={`a${i}`} value={o.value} required />
                  {o.label}
                </label>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
