-- AlterTable
ALTER TABLE "Insurer" ADD COLUMN     "gatewayCustomerId" TEXT;

-- AlterTable
ALTER TABLE "InsuranceBatch" ADD COLUMN     "invoiceExternalId" TEXT,
ADD COLUMN     "invoiceStatus" TEXT;

