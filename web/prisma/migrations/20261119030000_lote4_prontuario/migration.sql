-- AlterTable
ALTER TABLE "ClinicalAccessGrant" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "RecordTemplate" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "professionalId" TEXT,
    "name" TEXT NOT NULL,
    "type" "RecordType" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecordTemplate_clinicId_idx" ON "RecordTemplate"("clinicId");

-- CreateIndex
CREATE INDEX "ClinicalAccessGrant_granteeId_idx" ON "ClinicalAccessGrant"("granteeId");

-- CreateIndex
CREATE INDEX "ClinicalAccessGrant_recordId_idx" ON "ClinicalAccessGrant"("recordId");

-- AddForeignKey
ALTER TABLE "RecordTemplate" ADD CONSTRAINT "RecordTemplate_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

