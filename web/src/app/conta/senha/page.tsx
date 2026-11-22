import { requireUser } from "@/lib/session";
import { AuthShell } from "@/components/brand";
import { PasswordForm } from "./password-form";

export const dynamic = "force-dynamic";

export default async function PasswordPage() {
  const user = await requireUser({ incomplete: true });
  return (
    <AuthShell
      title="Trocar senha"
      subtitle={user.mustChangePassword ? "Sua senha é provisória. Defina uma nova para continuar." : "Escolha uma senha forte, com ao menos 12 caracteres."}
    >
      <PasswordForm />
    </AuthShell>
  );
}
