import { headers } from "next/headers";
import { db } from "./db";

export async function audit(params: {
  clinicId: string;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
}) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  await db.auditLog.create({
    data: { ...params, userId: params.userId ?? null, entityId: params.entityId ?? null, ip },
  });
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconhecido";
}
