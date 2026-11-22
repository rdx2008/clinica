-- AlterTable
ALTER TABLE "InsuranceEntry" ADD COLUMN     "appealNote" TEXT,
ADD COLUMN     "glossReason" TEXT;

-- CreateTable
CREATE TABLE "InsurancePayment" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "insurerId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "paymentMonth" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'RETORNO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsurancePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InsurancePayment_entryId_idx" ON "InsurancePayment"("entryId");

-- CreateIndex
CREATE INDEX "InsurancePayment_clinicId_paymentMonth_idx" ON "InsurancePayment"("clinicId", "paymentMonth");

-- CreateIndex
CREATE INDEX "InsurancePayment_professionalId_paymentMonth_idx" ON "InsurancePayment"("professionalId", "paymentMonth");

-- AddForeignKey
ALTER TABLE "InsurancePayment" ADD CONSTRAINT "InsurancePayment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "InsuranceEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Recebimentos ja registrados viram pagamentos (base do repasse)
INSERT INTO "InsurancePayment" ("id", "clinicId", "entryId", "insurerId", "professionalId", "amountCents", "paidAt", "paymentMonth", "kind")
SELECT 'bf_' || "id", "clinicId", "id", "insurerId", "professionalId", "amountCents", COALESCE("paidAt", now()), COALESCE("paymentMonth", to_char(COALESCE("paidAt", now()), 'YYYY-MM')), 'RETORNO'
FROM "InsuranceEntry" WHERE "status" = 'PAGO';
