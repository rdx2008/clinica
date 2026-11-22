import Link from "next/link";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { readFiscal } from "@/lib/asaas-core";
import { registerWebhookAction, saveGatewayAction, testGatewayAction } from "@/app/actions/gateway";

export const dynamic = "force-dynamic";

const input = "w-full rounded border px-3 py-2 text-sm";

export default async function GatewaySettingsPage({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const user = await requireRole("ADMIN");
  const sp = await searchParams;
  const acc = await db.paymentAccount.findUnique({ where: { clinicId: user.clinicId } });
  const f = readFiscal(acc?.fiscal);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href="/configuracoes" className="text-xs text-zinc-500 underline">← Configurações</Link>
        <h1 className="text-2xl">Pagamentos e nota fiscal</h1>
        <p className="text-sm text-zinc-600">Pix com QR Code e emissão de NFS-e (nota fiscal de serviço) pelo Asaas.</p>
      </div>
      {sp.erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}
      {sp.ok && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{sp.ok}</p>}

      <section className="space-y-1 rounded border bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">Antes de começar</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Crie a conta no Asaas e gere uma chave de API (use o <strong>sandbox</strong> para testar sem dinheiro real).</li>
          <li>Para a NFS-e, a prefeitura precisa aceitar emissão por integração e os dados fiscais devem estar cadastrados no Asaas (confirme com o contador).</li>
          <li>Ao gerar cobranças, o nome e o CPF do paciente são enviados ao Asaas. Informe isso na política de privacidade da clínica.</li>
        </ul>
      </section>

      <form action={saveGatewayAction} className="space-y-4">
        <section className="space-y-3 rounded border p-5">
          <h2>Conta do Asaas</h2>
          <label className="block text-sm">Ambiente
            <select name="environment" defaultValue={acc?.environment ?? "SANDBOX"} className={input}>
              <option value="SANDBOX">Sandbox (testes)</option>
              <option value="PRODUCTION">Produção (dinheiro real)</option>
            </select>
          </label>
          <label className="block text-sm">Chave de API
            <input name="apiKey" type="password" autoComplete="off" placeholder={acc ? "Deixe em branco para manter a atual" : "$aact_..."} className={input} />
            <span className="text-xs text-zinc-500">Guardada criptografada e nunca exibida de novo. A chave de sandbox não funciona em produção, e vice-versa.</span>
          </label>
        </section>

        <section className="space-y-3 rounded border p-5">
          <h2>Dados padrão da nota de serviço</h2>
          <label className="block text-sm">Serviço (nome na prefeitura)
            <input name="municipalServiceName" defaultValue={f.municipalServiceName} className={input} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">Código do serviço municipal
              <input name="municipalServiceCode" defaultValue={f.municipalServiceCode} placeholder="ex.: 04.08 (psicologia)" className={input} />
            </label>
            <label className="block text-sm">ID do serviço municipal (se a prefeitura usar)
              <input name="municipalServiceId" defaultValue={f.municipalServiceId} className={input} />
            </label>
            <label className="block text-sm">Alíquota de ISS (%)
              <input name="issPercent" type="number" step="0.01" min={0} max={10} defaultValue={f.issPercent} className={input} />
            </label>
            <label className="flex items-center gap-2 pt-7 text-sm">
              <input type="checkbox" name="retainIss" defaultChecked={f.retainIss} /> ISS retido pelo tomador
            </label>
          </div>
          <label className="block text-sm">Descrição da nota
            <textarea name="descriptionTemplate" rows={2} defaultValue={f.descriptionTemplate} className={input} />
            <span className="text-xs text-zinc-500">Variáveis: {"{data}"} (data do atendimento) e {"{paciente}"}. Confirme com o contador o texto, o código e a alíquota corretos.</span>
          </label>
        </section>

        <button className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">Salvar</button>
      </form>

      {acc && (
        <section className="space-y-3 rounded border p-5">
          <h2>Conexão</h2>
          <div className="flex flex-wrap gap-2">
            <form action={testGatewayAction}><button className="rounded border px-3 py-2 text-sm">Testar conexão</button></form>
            <form action={registerWebhookAction}><button className="rounded border px-3 py-2 text-sm">Cadastrar webhook no Asaas</button></form>
          </div>
          <p className="text-xs text-zinc-500">
            O webhook faz o sistema saber na hora quando um Pix é pago e quando a nota é emitida. Se preferir cadastrar manualmente no painel do Asaas, use a URL
            <code className="mx-1 break-all">{proto}://{host}/api/webhooks/asaas/{acc.id}</code> e o token de autenticação: use o botão acima para evitar copiar o segredo.
          </p>
        </section>
      )}
    </div>
  );
}
