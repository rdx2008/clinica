import Link from "next/link";
import { requireRole } from "@/lib/session";
import { ImportForm } from "./import-form";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  await requireRole("ADMIN", "RECEPCAO");
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <Link href="/pacientes" className="text-xs text-zinc-500 underline">← Pacientes</Link>
        <h1 className="text-2xl">Importar pacientes</h1>
        <p className="text-sm text-zinc-600">Traga o cadastro de outro sistema ou de uma planilha. Duplicados são ignorados automaticamente.</p>
      </div>

      <section className="space-y-2 rounded border p-4 text-sm">
        <h2>Como preparar a planilha</h2>
        <ol className="list-decimal space-y-1 pl-5 text-zinc-700">
          <li>Salve como <strong>CSV</strong> (Excel: Arquivo → Salvar como → CSV). Separador vírgula ou ponto e vírgula.</li>
          <li>Primeira linha com os nomes das colunas. A coluna <strong>Nome</strong> é obrigatória.</li>
          <li>Colunas reconhecidas: <code>nome</code>, <code>telefone</code>, <code>email</code>, <code>nascimento</code> (dd/mm/aaaa), <code>cpf</code>, <code>origem</code>, <code>etiquetas</code>.</li>
          <li>Até 2.000 linhas e 1 MB por importação.</li>
        </ol>
        <p className="text-xs text-zinc-500">Exemplo: <code>nome;telefone;nascimento</code> / <code>Maria Souza;(11) 98765-4321;25/12/1990</code></p>
      </section>

      <ImportForm />
    </div>
  );
}
