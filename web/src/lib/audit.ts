import { headers } from "next/headers";
import { db } from "./db";

// O proxy (Traefik/Coolify) acrescenta o IP real ao FIM da lista; o começo pode ser forjado pelo cliente.
function lastForwarded(v: string | null): string | null {
  const parts = v?.split(",").map((x) => x.trim()).filter(Boolean);
  return parts?.length ? parts[parts.length - 1] : null;
}

export async function audit(params: {
  clinicId: string;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
}) {
  const h = await headers();
  const ip = lastForwarded(h.get("x-forwarded-for"));
  await db.auditLog.create({
    data: { ...params, userId: params.userId ?? null, entityId: params.entityId ?? null, ip },
  });
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return lastForwarded(h.get("x-forwarded-for")) ?? "desconhecido";
}
