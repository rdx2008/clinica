// Dados de demonstração (criar e remover). Tudo que é criado aqui é marcado para poder ser removido sem tocar nos dados reais:
// usuários @demo.invalid, pacientes com a etiqueta "demo", serviços/salas/respostas com sufixo "(demo)", despesas com prefixo "[demo]".
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { blindIndex, encryptField } from "./crypto";
import { hashPassword } from "./password";
import { addDays, localDate, parseLocal } from "./agenda";
import { generateValidCpf } from "./br";

const DEMO_DOMAIN = "@demo.invalid";
const SUFFIX = " (demo)";

const FIRST = ["Ana", "Bruno", "Camila", "Diego", "Elisa", "Fábio", "Gabriela", "Henrique", "Isabela", "João", "Karina", "Lucas", "Marina", "Nelson"];
const LAST = ["Almeida", "Barbosa", "Carvalho", "Dias", "Ferreira", "Gomes", "Lima", "Martins", "Nogueira", "Oliveira", "Pereira", "Ramos", "Souza", "Teixeira"];
const SOURCES = ["Indicação", "Instagram", "Google", "Convênio", "Indicação de paciente", "Site"];
const METHODS = ["PIX", "PIX", "CARTAO", "DINHEIRO", "TRANSFERENCIA"];

export async function demoExists(clinicId: string): Promise<boolean> {
  return (await db.user.count({ where: { clinicId, email: { endsWith: DEMO_DOMAIN } } })) > 0;
}

export async function createDemoData(clinicId: string): Promise<{ patients: number; appointments: number; charges: number }> {
  if (await demoExists(clinicId)) throw new Error("Os dados de demonstração já existem.");

  // --- profissionais, serviços e salas ---
  const pw = await hashPassword(randomBytes(24).toString("hex"));
  const mkProf = (name: string, email: string, council: string, color: string) =>
    db.user.create({
      data: {
        clinicId,
        name,
        email: `${email}${DEMO_DOMAIN}`,
        passwordHash: pw,
        role: "PROFISSIONAL",
        mustChangePassword: true,
        professional: { create: { clinicId, councilType: "CRP", councilNumber: council, color, specialty: "Psicologia", sharePercent: 50 } },
      },
      include: { professional: true },
    });
  const [u1, u2] = await Promise.all([
    mkProf("Dra. Helena Duarte", "helena", "06/123456", "#0f6b5d"),
    mkProf("Dr. Marcos Vieira", "marcos", "06/654321", "#2563eb"),
  ]);
  const profs = [u1.professional!, u2.professional!];

  const [svcInd, svcOn, svcAv] = await Promise.all([
    db.service.create({ data: { clinicId, name: `Psicoterapia individual${SUFFIX}`, durationMin: 50, priceCents: 18000, modality: "PRESENCIAL" } }),
    db.service.create({ data: { clinicId, name: `Psicoterapia online${SUFFIX}`, durationMin: 50, priceCents: 16000, modality: "ONLINE" } }),
    db.service.create({ data: { clinicId, name: `Avaliação inicial${SUFFIX}`, durationMin: 60, priceCents: 22000, modality: "PRESENCIAL" } }),
  ]);
  const services = [svcInd, svcOn, svcAv];
  const [room1, room2] = await Promise.all([
    db.room.create({ data: { clinicId, name: `Sala 1${SUFFIX}` } }),
    db.room.create({ data: { clinicId, name: `Sala 2${SUFFIX}` } }),
  ]);
  const rooms = [room1, room2];

  // Horários: Helena seg–sex; Marcos ter, qui e sáb manhã.
  await db.availability.createMany({
    data: [
      ...[1, 2, 3, 4, 5].flatMap((w) => [
        { professionalId: profs[0].id, weekday: w, startTime: "08:00", endTime: "12:00" },
        { professionalId: profs[0].id, weekday: w, startTime: "14:00", endTime: "18:00" },
      ]),
      ...[2, 4].flatMap((w) => [
        { professionalId: profs[1].id, weekday: w, startTime: "09:00", endTime: "12:00" },
        { professionalId: profs[1].id, weekday: w, startTime: "14:00", endTime: "19:00" },
      ]),
      { professionalId: profs[1].id, weekday: 6, startTime: "08:00", endTime: "12:00" },
    ],
  });

  // --- pacientes ---
  const patients: Awaited<ReturnType<typeof db.patient.create>>[] = [];
  for (let i = 0; i < 14; i++) {
    const name = `${FIRST[i]} ${LAST[(i * 5) % LAST.length]}`;
    const cpf = i % 2 === 0 ? generateValidCpf(i + 3) : null;
    const birth = new Date(Date.UTC(1975 + ((i * 7) % 35), (i * 5) % 12, 1 + ((i * 3) % 27)));
    const optin = i % 3 !== 0;
    const p = await db.patient.create({
      data: {
        clinicId,
        fullName: name,
        birthDate: birth,
        cpfEnc: cpf ? encryptField(cpf) : null,
        dedupeKey: cpf ? blindIndex(cpf) : null,
        phoneE164: `+5511${9}${String(80000000 + i * 137913).slice(0, 8)}`,
        email: `${name.split(" ")[0].toLowerCase()}.${i}${DEMO_DOMAIN}`,
        source: SOURCES[i % SOURCES.length],
        tags: ["demo", ...(i % 4 === 0 ? ["prioridade"] : []), ...(i % 5 === 0 ? ["convênio"] : [])],
        sex: i % 2 === 0 ? "F" : "M",
        occupation: ["Professora", "Engenheiro", "Designer", "Enfermeira", "Advogado"][i % 5],
        address: "Rua das Acácias, 120, Pinheiros, São Paulo/SP",
        emergencyName: "Contato de emergência",
        emergencyPhone: "+5511988887777",
        insurance: i % 5 === 0 ? "Plano Saúde Demo" : null,
        consents: {
          create: [
            { type: "TRATAMENTO_DADOS", version: "v1", channel: "PRESENCIAL" },
            ...(optin ? [{ type: "WHATSAPP_OPTIN", version: "v1", channel: "PRESENCIAL" }] : []),
          ],
        },
      },
    });
    patients.push(p);
  }

  // --- atendimentos: 21 dias atrás até 14 dias à frente (dias úteis) ---
  const today = localDate(new Date());
  const slotTimes = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00"];
  const appts: {
    clinicId: string;
    patientId: string;
    professionalId: string;
    serviceId: string;
    roomId: string;
    startsAt: Date;
    endsAt: Date;
    status: "AGENDADA" | "CONFIRMADA" | "COMPARECEU" | "FALTOU" | "CANCELADA";
    cancelReason: string | null;
    cancelledAt: Date | null;
    source: string;
  }[] = [];
  let n = 0;
  for (let off = -21; off <= 14; off++) {
    const day = addDays(today, off);
    const wd = new Date(`${day}T12:00:00.000-03:00`).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    profs.forEach((prof, pi) => {
      if (pi === 1 && ![2, 4].includes(wd)) return;
      const count = 2 + ((n + pi) % 3);
      for (let k = 0; k < count; k++) {
        const time = slotTimes[(k * 2 + pi) % slotTimes.length];
        const svc = services[(n + k) % services.length];
        const patient = patients[(n * 3 + k * 5 + pi) % patients.length];
        const start = parseLocal(day, time)!;
        const end = new Date(start.getTime() + svc.durationMin * 60_000);
        let status: (typeof appts)[number]["status"];
        const r = (n * 7 + k * 3 + pi) % 10;
        if (off < 0) status = r < 7 ? "COMPARECEU" : r < 8 ? "FALTOU" : r < 9 ? "CANCELADA" : off < -2 ? "COMPARECEU" : "AGENDADA";
        else if (off === 0) status = r < 5 ? "CONFIRMADA" : "AGENDADA";
        else status = r < 4 ? "CONFIRMADA" : "AGENDADA";
        appts.push({
          clinicId,
          patientId: patient.id,
          professionalId: prof.id,
          serviceId: svc.id,
          roomId: rooms[pi].id,
          startsAt: start,
          endsAt: end,
          status,
          cancelReason: status === "CANCELADA" ? "Paciente desmarcou" : null,
          cancelledAt: status === "CANCELADA" ? start : null,
          source: "MANUAL",
        });
      }
      n++;
    });
  }
  // remove horários duplicados por profissional/dia (garante que a regra anti-sobreposição não dispare)
  const seen = new Set<string>();
  const unique = appts.filter((a) => {
    const key = `${a.professionalId}|${a.startsAt.toISOString()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const created = [];
  for (const a of unique) created.push(await db.appointment.create({ data: a }));

  // --- cobranças das sessões realizadas ---
  const svcById = new Map(services.map((s) => [s.id, s]));
  let chargeCount = 0;
  for (const a of created.filter((x) => x.status === "COMPARECEU")) {
    const svc = svcById.get(a.serviceId)!;
    const date = localDate(a.startsAt);
    const paid = chargeCount % 10 < 7;
    await db.charge.create({
      data: {
        clinicId,
        patientId: a.patientId,
        appointmentId: a.id,
        amountCents: svc.priceCents,
        dueDate: new Date(`${date}T00:00:00.000Z`),
        competence: date.slice(0, 7),
        ...(paid ? { status: "PAGA" as const, method: METHODS[chargeCount % METHODS.length], paidAt: a.startsAt } : {}),
      },
    });
    chargeCount++;
  }

  // --- pacote, despesas, lista de espera, respostas rápidas ---
  await db.package.create({ data: { clinicId, patientId: patients[2].id, serviceId: svcInd.id, sessionsTotal: 8, sessionsUsed: 3, priceCents: 120000 } });
  const month = today.slice(0, 7);
  const prev = localDate(new Date(Date.now() - 30 * 86400_000)).slice(0, 7);
  await db.expense.createMany({
    data: [
      { clinicId, description: "[demo] Aluguel da sala", category: "Aluguel", amountCents: 280000, date: new Date(`${month}-05T00:00:00.000Z`), paidAt: new Date() },
      { clinicId, description: "[demo] Contabilidade", category: "Contabilidade", amountCents: 45000, date: new Date(`${month}-10T00:00:00.000Z`) },
      { clinicId, description: "[demo] Software e assinaturas", category: "Software e serviços", amountCents: 19900, date: new Date(`${month}-12T00:00:00.000Z`), paidAt: new Date() },
      { clinicId, description: "[demo] Aluguel da sala", category: "Aluguel", amountCents: 280000, date: new Date(`${prev}-05T00:00:00.000Z`), paidAt: new Date() },
      { clinicId, description: "[demo] Material de escritório", category: "Materiais", amountCents: 12000, date: new Date(`${prev}-18T00:00:00.000Z`), paidAt: new Date() },
    ],
  });
  await db.waitlistEntry.createMany({
    data: [
      { clinicId, patientId: patients[5].id, professionalId: profs[0].id, serviceId: svcInd.id, preference: "terças e quintas à tarde" },
      { clinicId, patientId: patients[9].id, preference: "qualquer horário após as 17h" },
    ],
  });
  await db.quickReply.createMany({
    data: [
      { clinicId, title: `Endereço${SUFFIX}`, body: "Estamos na Rua das Acácias, 120, Pinheiros. Há estacionamento conveniado ao lado." },
      { clinicId, title: `Formas de pagamento${SUFFIX}`, body: "Aceitamos Pix, cartão e dinheiro. O pagamento é feito ao final da sessão." },
      { clinicId, title: `Política de cancelamento${SUFFIX}`, body: "Cancelamentos e remarcações podem ser feitos com até 24 horas de antecedência, sem custo." },
    ],
  });

  // --- conversas de WhatsApp de exemplo (para ver a caixa de entrada) ---
  const convs: { p: (typeof patients)[number]; msgs: [("ENTRADA" | "SAIDA"), string][]; state: "ATIVA" | "TRANSFERIDA"; unread: number }[] = [
    { p: patients[1], state: "ATIVA", unread: 1, msgs: [["ENTRADA", "Boa tarde! Vocês atendem aos sábados?"]] },
    { p: patients[4], state: "TRANSFERIDA", unread: 2, msgs: [["ENTRADA", "Preciso remarcar minha consulta de quinta."], ["SAIDA", "Obrigado pela mensagem! Vou encaminhar para a nossa equipe."], ["ENTRADA", "Pode ser na semana que vem?"]] },
    { p: patients[7], state: "ATIVA", unread: 0, msgs: [["SAIDA", "Olá! Lembrete da sua consulta amanhã às 15:00. Responda 1 para confirmar ou 2 para cancelar."], ["ENTRADA", "1"], ["SAIDA", "Consulta confirmada para amanhã às 15:00. Até lá!"]] },
  ];
  for (const c of convs) {
    const now = new Date();
    const conv = await db.waConversation.create({
      data: { clinicId, patientId: c.p.id, waContact: c.p.phoneE164!, aiState: c.state, unread: c.unread, lastMsgAt: now, windowExpiresAt: new Date(now.getTime() + 20 * 3600_000) },
    });
    let t = now.getTime() - c.msgs.length * 3 * 60_000;
    for (const [dir, body] of c.msgs) {
      await db.waMessage.create({ data: { conversationId: conv.id, direction: dir, body: encryptField(body), status: dir === "ENTRADA" ? "RECEBIDA" : "ENTREGUE", createdAt: new Date(t) } });
      t += 3 * 60_000;
    }
  }

  return { patients: patients.length, appointments: created.length, charges: chargeCount };
}

// Remove somente o que foi criado como demonstração.
export async function removeDemoData(clinicId: string): Promise<void> {
  const users = await db.user.findMany({ where: { clinicId, email: { endsWith: DEMO_DOMAIN } }, select: { id: true, professional: { select: { id: true } } } });
  const profIds = users.flatMap((u) => (u.professional ? [u.professional.id] : []));
  const patients = await db.patient.findMany({ where: { clinicId, tags: { has: "demo" } }, select: { id: true } });
  const patientIds = patients.map((p) => p.id);
  const svcIds = (await db.service.findMany({ where: { clinicId, name: { endsWith: SUFFIX } }, select: { id: true } })).map((s) => s.id);
  const convIds = (await db.waConversation.findMany({ where: { clinicId, patientId: { in: patientIds } }, select: { id: true } })).map((c) => c.id);
  const apptIds = (
    await db.appointment.findMany({ where: { clinicId, OR: [{ patientId: { in: patientIds } }, { professionalId: { in: profIds } }, { serviceId: { in: svcIds } }] }, select: { id: true } })
  ).map((a) => a.id);

  await db.$transaction([
    db.waNote.deleteMany({ where: { conversationId: { in: convIds } } }),
    db.waMessage.deleteMany({ where: { conversationId: { in: convIds } } }),
    db.aiEvent.deleteMany({ where: { conversationId: { in: convIds } } }),
    db.waConversation.deleteMany({ where: { id: { in: convIds } } }),
    db.waitlistEntry.deleteMany({ where: { clinicId, patientId: { in: patientIds } } }),
    db.charge.deleteMany({ where: { clinicId, OR: [{ patientId: { in: patientIds } }, { appointmentId: { in: apptIds } }] } }),
    db.appointment.deleteMany({ where: { id: { in: apptIds } } }),
    db.package.deleteMany({ where: { clinicId, patientId: { in: patientIds } } }),
    db.consent.deleteMany({ where: { patientId: { in: patientIds } } }),
    db.guardian.deleteMany({ where: { patientId: { in: patientIds } } }),
    db.authorizedContact.deleteMany({ where: { patientId: { in: patientIds } } }),
    db.contactPreference.deleteMany({ where: { patientId: { in: patientIds } } }),
    db.patient.deleteMany({ where: { id: { in: patientIds } } }),
    db.expense.deleteMany({ where: { clinicId, description: { startsWith: "[demo]" } } }),
    db.quickReply.deleteMany({ where: { clinicId, title: { endsWith: SUFFIX } } }),
    db.payout.deleteMany({ where: { clinicId, professionalId: { in: profIds } } }),
    db.block.deleteMany({ where: { professionalId: { in: profIds } } }),
    db.availability.deleteMany({ where: { professionalId: { in: profIds } } }),
    db.professional.deleteMany({ where: { id: { in: profIds } } }),
    db.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } }),
    db.service.deleteMany({ where: { id: { in: svcIds } } }),
    db.room.deleteMany({ where: { clinicId, name: { endsWith: SUFFIX } } }),
  ]);
}
