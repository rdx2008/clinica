import { requireUser } from "@/lib/session";
import { PasswordForm } from "./password-form";

export const dynamic = "force-dynamic";

export default async function PasswordPage() {
  const user = await requireUser();
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-5 px-4">
      <div>
        <h1 className="text-2xl font-semibold">Trocar senha</h1>
        {user.mustChangePassword && (
          <p className="mt-1 text-sm text-zinc-600">Sua senha é provisória. Defina uma nova para continuar.</p>
        )}
      </div>
      <PasswordForm />
    </main>
  );
}
