-- Anti-sobreposicao garantida pelo banco (vale mesmo sob concorrencia).
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_valid_range" CHECK ("endsAt" > "startsAt");

-- Um profissional nao pode ter dois atendimentos ativos no mesmo horario.
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_professional_no_overlap"
  EXCLUDE USING gist ("professionalId" WITH =, tsrange("startsAt", "endsAt", '[)') WITH &&)
  WHERE ("status" NOT IN ('CANCELADA', 'REMARCADA'));

-- Idem para a sala (quando houver).
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_room_no_overlap"
  EXCLUDE USING gist ("roomId" WITH =, tsrange("startsAt", "endsAt", '[)') WITH &&)
  WHERE ("roomId" IS NOT NULL AND "status" NOT IN ('CANCELADA', 'REMARCADA'));
