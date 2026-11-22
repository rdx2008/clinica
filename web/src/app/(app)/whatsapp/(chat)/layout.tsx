import { db } from "@/lib/db";
import { decryptField } from "@/lib/crypto";
import { requireRole } from "@/lib/session";
import { formatPhoneBR } from "@/lib/br";
import { windowOpen } from "@/lib/whatsapp";
import { ChatShell, type ChatItem } from "./chat-shell";

export const dynamic = "force-dynamic";

export default async function WhatsappLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("ADMIN", "RECEPCAO");

  const [account, convs, staff] = await Promise.all([
    db.waAccount.findFirst({ where: { clinicId: user.clinicId }, select: { id: true } }),
    db.waConversation.findMany({
      where: { clinicId: user.clinicId },
      orderBy: { lastMsgAt: "desc" },
      take: 150,
      include: {
        patient: { select: { fullName: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true, type: true, direction: true } },
      },
    }),
    db.user.findMany({ where: { clinicId: user.clinicId, role: { in: ["ADMIN", "RECEPCAO"] } }, select: { id: true, name: true } }),
  ]);
  const staffName = new Map(staff.map((s) => [s.id, s.name.split(" ")[0]]));

  const items: ChatItem[] = convs.map((c) => {
    const last = c.messages[0];
    let preview = "";
    if (last) {
      try {
        preview = last.body ? decryptField(last.body) : `[${last.type}]`;
      } catch {
        preview = "";
      }
    }
    return {
      id: c.id,
      name: c.patient?.fullName ?? formatPhoneBR(c.waContact),
      linked: !!c.patient,
      preview: preview.replace(/\s+/g, " ").slice(0, 80),
      previewOut: last?.direction === "SAIDA",
      at: c.lastMsgAt.toISOString(),
      unread: c.unread,
      transferred: c.aiState === "TRANSFERIDA",
      assignedTo: c.assignedTo,
      assignedName: c.assignedTo ? (staffName.get(c.assignedTo) ?? "atribuída") : null,
      windowOpen: windowOpen(c.windowExpiresAt),
    };
  });

  return (
    <ChatShell items={items} me={user.id} canConfigure={user.role === "ADMIN"} configured={!!account}>
      {children}
    </ChatShell>
  );
}
