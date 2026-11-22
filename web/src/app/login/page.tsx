import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { AuthShell } from "@/components/brand";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ redefinida?: string }> }) {
  const sp = await searchParams;
  if (await getCurrentUser()) redirect("/dashboard");
  if ((await db.user.count()) === 0) redirect("/setup");
  return (
    <AuthShell title="Entrar" subtitle="Acesse com seu e-mail e senha.">
      {sp.redefinida && <p role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Senha redefinida. Entre com a nova senha.</p>}
      <LoginForm />
    </AuthShell>
  );
}
