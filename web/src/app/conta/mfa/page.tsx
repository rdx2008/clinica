import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { generateTotpSecret, otpauthUrl } from "@/lib/totp";
import { MfaForm } from "./mfa-form";

export const dynamic = "force-dynamic";

export default async function MfaPage() {
  const user = await requireUser();
  if (user.mfaSecret) redirect("/dashboard");
  const secret = generateTotpSecret();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 px-4">
      <h1 className="text-2xl font-semibold">Ativar verificação em duas etapas</h1>
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>Abra um aplicativo autenticador (Google Authenticator, Microsoft Authenticator, Authy).</li>
        <li>
          Adicione uma conta digitando esta chave manualmente:
          <code className="mt-1 block break-all rounded bg-zinc-100 p-2 font-mono text-base dark:bg-zinc-800">{secret}</code>
        </li>
        <li>
          Ou abra o link no celular: <a className="text-emerald-700 underline" href={otpauthUrl(secret, user.email)}>adicionar ao autenticador</a>.
        </li>
        <li>Digite abaixo o código de 6 dígitos que o aplicativo mostrar.</li>
      </ol>
      <MfaForm secret={secret} />
    </main>
  );
}
