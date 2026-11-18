import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { formatPhoneBR } from "@/lib/br";
import { windowOpen } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export default async function WhatsappInbox() {
  const user = await requireRole("ADMIN", "RECEPCAO");
  const [account, conversations] = await Promise.all([
    db.waAccount.findFirst({ where: { clinicId: user.clinicId }, select: { status: true } }),
    db.waConversation.findMany({
      where: { clinicId: user.clinicId },
      orderBy: { lastMsgAt: "desc" },
      take: 100,
      include: { patient: { select: { fullName: true } } },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">WhatsApp</h1>
        {user.role === "ADMIN" && (
          <div className="flex gap-2">
            <Link href="/whatsapp/automacoes" className="rounded border px-3 py-2 text-sm">Modelos e lembretes</Link>
            <Link href="/whatsapp/config" className="rounded border px-3 py-2 text-sm">Configuração</Link>
          </div>
        )}
      </div>
      {!account && (
        <p className="rounded border p-4 text-sm text-zinc-600">
          WhatsApp ainda não configurado.{" "}
          {user.role === "ADMIN" ? <Link href="/whatsapp/config" className="underline">Configurar agora</Link> : "Peça ao administrador."}
        </p>
      )}
      <ul className="divide-y rounded border text-sm">
        {conversations.length === 0 && <li className="p-3 text-zinc-500">Nenhuma conversa ainda.</li>}
        {conversations.map((c) => (
          <li key={c.id}>
            <Link href={`/whatsapp/${c.id}`} className="flex items-center justify-between gap-2 p-3 hover:bg-zinc-50">
              <span>
                <span className="font-medium">{c.patient?.fullName ?? formatPhoneBR(c.waContact)}</span>
                {!c.patient && <span className="ml-2 text-xs text-amber-700">não vinculado a paciente</span>}
              </span>
              <span className="text-xs text-zinc-500">
                {c.lastMsgAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}
                {windowOpen(c.windowExpiresAt) ? " · janela aberta" : ""}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
