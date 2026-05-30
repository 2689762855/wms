-- AlterTable
ALTER TABLE "Inventory" ADD COLUMN "batchNo" TEXT;

-- AlterTable
ALTER TABLE "OutboundItem" ADD COLUMN "batchNo" TEXT;

-- AlterTable
ALTER TABLE "ContainerItem" ADD COLUMN "batchNo" TEXT;
