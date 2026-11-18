import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if ((await db.user.count()) > 0) redirect("/login");
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold">Primeira configuração</h1>
        <p className="mt-1 text-sm text-zinc-600">Cria a clínica e o primeiro administrador. Esta tela some depois do primeiro cadastro.</p>
      </div>
      <SetupForm />
    </main>
  );
}
