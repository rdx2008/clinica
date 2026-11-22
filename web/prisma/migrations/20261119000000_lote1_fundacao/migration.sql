-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "address" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mfaBackupHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "resetTokenExpires" TIMESTAMP(3),
ADD COLUMN     "resetTokenHash" TEXT;

-- AlterTable
ALTER TABLE "Professional" ADD COLUMN     "color" TEXT;

