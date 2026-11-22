import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { AuthShell } from "@/components/brand";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if ((await db.user.count()) > 0) redirect("/login");
  return (
    <AuthShell
      title="Primeira configuração"
      subtitle="Crie a clínica e o primeiro administrador. Esta tela some depois do primeiro cadastro."
    >
      <SetupForm />
    </AuthShell>
  );
}
