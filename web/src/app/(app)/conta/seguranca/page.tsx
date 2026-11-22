import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { RegenForm } from "./regen-form";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const user = await requireUser();
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { mfaBackupHashes: true } });
  const left = row.mfaBackupHashes.length;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl">Segurança da conta</h1>

      <section className="space-y-2 rounded border p-4">
        <h2>Senha</h2>
        <p className="text-sm text-zinc-600">Use uma senha longa e exclusiva. Trocar a senha encerra as outras sessões abertas.</p>
        <Link href="/conta/senha" className="inline-block rounded border px-3 py-2 text-sm">Trocar senha</Link>
      </section>

      <section className="space-y-3 rounded border p-4">
        <h2>Verificação em duas etapas</h2>
        {user.mfaSecret ? (
          <>
            <p className="text-sm text-zinc-600">
              Ativa. Códigos de backup restantes: <strong>{left}</strong>
              {left <= 2 && <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">poucos restantes: gere novos</span>}
            </p>
            <p className="text-sm text-zinc-600">Use um código de backup no login se perder o celular. Gerar novos códigos invalida os anteriores.</p>
            <RegenForm />
          </>
        ) : (
          <p className="text-sm text-zinc-600">Ainda não ativada. <Link href="/conta/mfa" className="underline">Ativar agora</Link>.</p>
        )}
      </section>
    </div>
  );
}
