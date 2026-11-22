import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { generateTotpSecret, otpauthUrl } from "@/lib/totp";
import { AuthShell } from "@/components/brand";
import { MfaForm } from "./mfa-form";

export const dynamic = "force-dynamic";

export default async function MfaPage() {
  const user = await requireUser({ incomplete: true });
  if (user.mfaSecret) redirect("/dashboard");
  const secret = generateTotpSecret();
  return (
    <AuthShell title="Verificação em duas etapas" subtitle="Protege os dados dos pacientes mesmo se a senha vazar." wide>
      <ol className="mb-5 list-decimal space-y-2 pl-5 text-sm text-zinc-700">
        <li>Abra um aplicativo autenticador (Google Authenticator, Microsoft Authenticator, Authy).</li>
        <li>
          Adicione uma conta digitando esta chave manualmente:
          <code className="mt-1 block break-all rounded-lg bg-zinc-100 p-2.5 font-mono text-base tracking-wide">{secret}</code>
        </li>
        <li>
          Ou abra o link no celular: <a className="text-emerald-700 underline" href={otpauthUrl(secret, user.email)}>adicionar ao autenticador</a>.
        </li>
        <li>Digite abaixo o código de 6 dígitos que o aplicativo mostrar.</li>
      </ol>
      <MfaForm secret={secret} />
    </AuthShell>
  );
}
