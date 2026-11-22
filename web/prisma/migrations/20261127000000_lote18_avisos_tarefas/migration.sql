-- CreateTable
CREATE TABLE "PortalNotice" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ENVIADA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientTask" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "titleEnc" TEXT NOT NULL,
    "textEnc" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "responseEnc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneAt" TIMESTAMP(3),
    "seenAt" TIMESTAMP(3),

    CONSTRAINT "PatientTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PortalNotice_clinicId_createdAt_idx" ON "PortalNotice"("clinicId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PortalNotice_patientId_kind_refId_key" ON "PortalNotice"("patientId", "kind", "refId");

-- CreateIndex
CREATE INDEX "PatientTask_clinicId_patientId_idx" ON "PatientTask"("clinicId", "patientId");

-- CreateIndex
CREATE INDEX "PatientTask_professionalId_status_idx" ON "PatientTask"("professionalId", "status");

