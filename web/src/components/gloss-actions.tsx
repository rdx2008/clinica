import { acceptGlossAction, appealGlossAction, recoverGlossAction } from "@/app/actions/insurance-gloss";
import { reopenEntryAction } from "@/app/actions/insurance";

const btn = "rounded border px-2 py-1 text-xs";
const field = "rounded border bg-white px-2 py-1 text-xs";

// Ações de uma guia que já teve retorno do convênio: recurso, valor recuperado, aceitar a perda e estorno.
export function GlossActions({ id, status, today }: { id: string; status: string; today: string }) {
  if (status === "A_FATURAR" || status === "FATURADO" || status === "CANCELADO") return null;
  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      {status === "GLOSADO" && (
        <form action={appealGlossAction} className="flex items-center gap-1">
          <input type="hidden" name="id" value={id} />
          <input name="note" placeholder="Texto do recurso (opcional)" className={`${field} w-48`} />
          <button className={btn}>Enviar para recurso</button>
        </form>
      )}
      {(status === "GLOSADO" || status === "RECURSO") && (
        <>
          <form action={recoverGlossAction} className="flex items-center gap-1">
            <input type="hidden" name="id" value={id} />
            <input name="amount" required inputMode="decimal" placeholder="Valor recuperado" aria-label="Valor recuperado" className={`${field} w-28`} />
            <input name="date" type="date" defaultValue={today} aria-label="Data do recebimento" className={field} />
            <button className={btn}>Registrar recebimento</button>
          </form>
          <form action={acceptGlossAction}>
            <input type="hidden" name="id" value={id} />
            <button className={btn} title="Desiste de recuperar o restante">Aceitar glosa</button>
          </form>
        </>
      )}
      <form action={reopenEntryAction}>
        <input type="hidden" name="id" value={id} />
        <button className={btn} title="Apaga os pagamentos desta guia e volta para faturado">Estornar</button>
      </form>
    </div>
  );
}
