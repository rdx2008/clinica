import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

const CARDS = [
  { href: "/configuracoes/whatsapp/conexao", title: "Conexão", text: "Número, conta WhatsApp Business e token de acesso. Endereço do webhook para colar no painel da Meta." },
  { href: "/configuracoes/whatsapp/modelos", title: "Modelos e lembretes", text: "Modelos aprovados pela Meta e lembretes automáticos de consulta (24 h antes, por exemplo)." },
  { href: "/configuracoes/whatsapp/ia", title: "IA de recepção", text: "Conteúdo aprovado, protocolo de crise e mensagem de transferência para a equipe." },
  { href: "/configuracoes/whatsapp/respostas", title: "Respostas rápidas", text: "Textos prontos que aparecem como botões ao responder uma conversa." },
] as const;

export default async function WhatsappSettingsHub() {
  const user = await requireRole("ADMIN");
  const account = await db.waAccount.findFirst({ where: { clinicId: user.clinicId }, select: { status: true, phoneNumberId: true } });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href="/configuracoes" className="text-xs text-zinc-500 underline">← Configurações</Link>
        <h1 className="text-2xl">WhatsApp</h1>
        <p className="text-sm text-zinc-600">Ajustes do canal. O atendimento (conversas) fica em <Link href="/whatsapp" className="underline">WhatsApp</Link>, no menu.</p>
      </div>
      <p className="rounded-lg border bg-white p-3 text-sm">
        Situação da conexão: <strong>{account ? `ativa (número ${account.phoneNumberId})` : "não configurada"}</strong>
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {CARDS.map((c) => (
          <li key={c.href}>
            <Link href={c.href} className="block h-full rounded-2xl border bg-white p-4 shadow-sm hover:bg-zinc-50">
              <p className="font-[family-name:var(--font-display)] text-lg font-semibold">{c.title}</p>
              <p className="mt-1 text-sm text-zinc-600">{c.text}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
