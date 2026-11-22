-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "portalSlug" TEXT;

-- CreateTable
CREATE TABLE "PortalLink" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PortalLink_tokenHash_key" ON "PortalLink"("tokenHash");

-- CreateIndex
CREATE INDEX "PortalLink_clinicId_email_idx" ON "PortalLink"("clinicId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Clinic_portalSlug_key" ON "Clinic"("portalSlug");

