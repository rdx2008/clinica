-- CreateTable
CREATE TABLE "ScaleAssignment" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "scaleKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "source" TEXT NOT NULL DEFAULT 'PORTAL',
    "dataEnc" TEXT,
    "riskFlag" BOOLEAN NOT NULL DEFAULT false,
    "riskAckAt" TIMESTAMP(3),
    "seenAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "ScaleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TherapyPlan" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "focusEnc" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TherapyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TherapyGoal" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "textEnc" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'EM_ANDAMENTO',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "targetDate" TIMESTAMP(3),
    "noteEnc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TherapyGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicDocument" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentAcceptance" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "acceptedByName" TEXT NOT NULL,
    "relation" TEXT,
    "ip" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScaleAssignment_clinicId_patientId_idx" ON "ScaleAssignment"("clinicId", "patientId");

-- CreateIndex
CREATE INDEX "ScaleAssignment_professionalId_status_idx" ON "ScaleAssignment"("professionalId", "status");

-- CreateIndex
CREATE INDEX "TherapyPlan_clinicId_patientId_idx" ON "TherapyPlan"("clinicId", "patientId");

-- CreateIndex
CREATE INDEX "TherapyGoal_planId_idx" ON "TherapyGoal"("planId");

-- CreateIndex
CREATE INDEX "ClinicDocument_clinicId_active_idx" ON "ClinicDocument"("clinicId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicDocument_clinicId_key_version_key" ON "ClinicDocument"("clinicId", "key", "version");

-- CreateIndex
CREATE INDEX "DocumentAcceptance_clinicId_patientId_idx" ON "DocumentAcceptance"("clinicId", "patientId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentAcceptance_patientId_documentId_key" ON "DocumentAcceptance"("patientId", "documentId");

-- AddForeignKey
ALTER TABLE "TherapyGoal" ADD CONSTRAINT "TherapyGoal_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TherapyPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAcceptance" ADD CONSTRAINT "DocumentAcceptance_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ClinicDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

