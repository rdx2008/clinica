import { createHash } from "node:crypto";
import Link from "next/link";
import { db } from "@/lib/db";
import { AuthShell } from "@/components/brand";
import { ResetForm } from "./reset-form";

export const dynamic = "force-dynamic";

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await db.user.findFirst({
    where: { resetTokenHash: createHash("sha256").update(token).digest("hex"), resetTokenExpires: { gt: new Date() }, active: true },
    select: { name: true },
  });

  if (!user) {
    return (
      <AuthShell title="Link inválido ou expirado" subtitle="Peça ao administrador da clínica para gerar um novo link.">
        <Link href="/login" className="text-sm text-emerald-700 underline">Voltar ao login</Link>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Definir nova senha" subtitle={`Olá, ${user.name.split(" ")[0]}. Escolha uma senha com ao menos 12 caracteres.`}>
      <ResetForm token={token} />
    </AuthShell>
  );
}
