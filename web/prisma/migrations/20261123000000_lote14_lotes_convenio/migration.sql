-- AlterTable
ALTER TABLE "InsurerPrice" ADD COLUMN     "tussCode" TEXT;

-- AlterTable
ALTER TABLE "InsuranceEntry" ADD COLUMN     "batchId" TEXT,
ADD COLUMN     "guideNumber" TEXT;

-- CreateTable
CREATE TABLE "InsuranceBatch" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "insurerId" TEXT NOT NULL,
    "competence" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ABERTO',
    "sentAt" TIMESTAMP(3),
    "protocol" TEXT,
    "invoiceNumber" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "invoiceUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsuranceBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InsuranceBatch_insurerId_competence_idx" ON "InsuranceBatch"("insurerId", "competence");

-- CreateIndex
CREATE UNIQUE INDEX "InsuranceBatch_clinicId_number_key" ON "InsuranceBatch"("clinicId", "number");

-- AddForeignKey
ALTER TABLE "InsuranceEntry" ADD CONSTRAINT "InsuranceEntry_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InsuranceBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsuranceBatch" ADD CONSTRAINT "InsuranceBatch_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "Insurer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

