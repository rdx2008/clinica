import Link from "next/link";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { saveAccountAction } from "@/app/actions/whatsapp";

export const dynamic = "force-dynamic";

const input = "w-full rounded border px-3 py-2 text-sm";

export default async function WhatsappConfig({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const user = await requireRole("ADMIN");
  const sp = await searchParams;
  const account = await db.waAccount.findFirst({ where: { clinicId: user.clinicId } });
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/whatsapp" className="text-xs text-zinc-500 underline">← Conversas</Link>
      <h1 className="text-xl font-semibold">Configuração do WhatsApp</h1>
      {sp.erro && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{sp.erro}</p>}
      {sp.ok && <p className="rounded bg-emerald-50 p-3 text-sm text-emerald-800">Configuração salva.</p>}

      <section className="space-y-1 rounded border p-4 text-sm">
        <p className="font-medium">No painel da Meta (WhatsApp → Configuração → Webhook)</p>
        <p>URL de callback: <code className="break-all">{proto}://{host}/api/whatsapp/webhook</code></p>
        <p>Token de verificação: o valor da variável <code>WHATSAPP_VERIFY_TOKEN</code> do servidor.</p>
        <p>Assine o campo <code>messages</code>. A variável <code>WHATSAPP_APP_SECRET</code> deve ser o segredo do aplicativo Meta.</p>
      </section>

      <form action={saveAccountAction} className="space-y-3">
        <label className="block text-sm">ID do número de telefone (Phone number ID)
          <input name="phoneNumberId" required defaultValue={account?.phoneNumberId ?? ""} className={input} />
        </label>
        <label className="block text-sm">ID da conta WhatsApp Business (WABA ID)
          <input name="wabaId" required defaultValue={account?.wabaId ?? ""} className={input} />
        </label>
        <label className="block text-sm">Token de acesso permanente
          <input name="token" type="password" autoComplete="off" placeholder={account ? "Deixe em branco para manter o atual" : ""} className={input} />
        </label>
        <button className="rounded bg-emerald-700 px-4 py-2 text-sm text-white">Salvar</button>
        <p className="text-xs text-zinc-500">O token é guardado criptografado e nunca é exibido de novo.</p>
      </form>
    </div>
  );
}
