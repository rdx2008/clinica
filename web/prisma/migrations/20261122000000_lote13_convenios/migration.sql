-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "authorizationId" TEXT,
ADD COLUMN     "patientInsuranceId" TEXT;

-- CreateTable
CREATE TABLE "Insurer" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cnpj" TEXT,
    "paymentDays" INTEGER NOT NULL DEFAULT 30,
    "sharePercent" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Insurer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsurerPrice" (
    "id" TEXT NOT NULL,
    "insurerId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,

    CONSTRAINT "InsurerPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatientInsurance" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "insurerId" TEXT NOT NULL,
    "planName" TEXT,
    "cardEnc" TEXT NOT NULL,
    "validUntil" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientInsurance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceAuth" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientInsuranceId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sessionsTotal" INTEGER NOT NULL,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsuranceAuth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsuranceEntry" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "insurerId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "serviceDate" TIMESTAMP(3) NOT NULL,
    "competence" TEXT NOT NULL,
    "expectedDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'A_FATURAR',
    "paidAt" TIMESTAMP(3),
    "paymentMonth" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsuranceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Insurer_clinicId_name_key" ON "Insurer"("clinicId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "InsurerPrice_insurerId_serviceId_key" ON "InsurerPrice"("insurerId", "serviceId");

-- CreateIndex
CREATE INDEX "PatientInsurance_clinicId_patientId_idx" ON "PatientInsurance"("clinicId", "patientId");

-- CreateIndex
CREATE INDEX "InsuranceAuth_patientInsuranceId_idx" ON "InsuranceAuth"("patientInsuranceId");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceEntry_appointmentId_key" ON "InsuranceEntry"("appointmentId");

-- CreateIndex
CREATE INDEX "InsuranceEntry_clinicId_competence_idx" ON "InsuranceEntry"("clinicId", "competence");

-- CreateIndex
CREATE INDEX "InsuranceEntry_clinicId_status_idx" ON "InsuranceEntry"("clinicId", "status");

-- CreateIndex
CREATE INDEX "InsuranceEntry_professionalId_paymentMonth_idx" ON "InsuranceEntry"("professionalId", "paymentMonth");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientInsuranceId_fkey" FOREIGN KEY ("patientInsuranceId") REFERENCES "PatientInsurance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_authorizationId_fkey" FOREIGN KEY ("authorizationId") REFERENCES "InsuranceAuth"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsurerPrice" ADD CONSTRAINT "InsurerPrice_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "Insurer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientInsurance" ADD CONSTRAINT "PatientInsurance_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "Insurer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceAuth" ADD CONSTRAINT "InsuranceAuth_patientInsuranceId_fkey" FOREIGN KEY ("patientInsuranceId") REFERENCES "PatientInsurance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceEntry" ADD CONSTRAINT "InsuranceEntry_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "Insurer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceEntry" ADD CONSTRAINT "InsuranceEntry_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

