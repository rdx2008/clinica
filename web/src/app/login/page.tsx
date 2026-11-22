import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { AuthShell } from "@/components/brand";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  if ((await db.user.count()) === 0) redirect("/setup");
  return (
    <AuthShell title="Entrar" subtitle="Acesse com seu e-mail e senha.">
      <LoginForm />
    </AuthShell>
  );
}
