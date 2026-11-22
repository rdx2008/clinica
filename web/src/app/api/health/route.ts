import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Verificação de saúde para o Coolify/monitoramento: confirma que o app responde e o banco está acessível.
// Não expõe nenhum dado.
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "erro" }, { status: 503 });
  }
}
