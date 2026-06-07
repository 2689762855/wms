-- AlterTable: add image/expiry/productWarehouse
ALTER TABLE "Product" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "Product" ADD COLUMN "expiryDate" DATETIME;
ALTER TABLE "Product" ADD COLUMN "expiryWarningDays" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "ProductWarehouse" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productId" INTEGER NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "safetyStock" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductWarehouse_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductWarehouse_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductWarehouse_productId_warehouseId_key" ON "ProductWarehouse"("productId", "warehouseId");

-- CreateIndex
CREATE INDEX "ProductWarehouse_warehouseId_idx" ON "ProductWarehouse"("warehouseId");
