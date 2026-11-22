-- AlterTable
ALTER TABLE "ClinicalAttachment" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'ANEXO',
ADD COLUMN     "sha256" TEXT,
ADD COLUMN     "signatureJson" TEXT;

