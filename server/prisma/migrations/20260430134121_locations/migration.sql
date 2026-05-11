-- CreateTable
CREATE TABLE "Location" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "warehouseId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Location_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_InboundOrder" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderNo" TEXT NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "supplier" TEXT,
    "operatorId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "locationId" INTEGER,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InboundOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InboundOrder_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InboundOrder_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_InboundOrder" ("createdAt", "id", "note", "operatorId", "orderNo", "status", "supplier", "warehouseId") SELECT "createdAt", "id", "note", "operatorId", "orderNo", "status", "supplier", "warehouseId" FROM "InboundOrder";
DROP TABLE "InboundOrder";
ALTER TABLE "new_InboundOrder" RENAME TO "InboundOrder";
CREATE UNIQUE INDEX "InboundOrder_orderNo_key" ON "InboundOrder"("orderNo");
CREATE TABLE "new_OutboundOrder" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderNo" TEXT NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "receiver" TEXT,
    "operatorId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "locationId" INTEGER,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OutboundOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OutboundOrder_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OutboundOrder_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_OutboundOrder" ("createdAt", "id", "note", "operatorId", "orderNo", "receiver", "status", "warehouseId") SELECT "createdAt", "id", "note", "operatorId", "orderNo", "receiver", "status", "warehouseId" FROM "OutboundOrder";
DROP TABLE "OutboundOrder";
ALTER TABLE "new_OutboundOrder" RENAME TO "OutboundOrder";
CREATE UNIQUE INDEX "OutboundOrder_orderNo_key" ON "OutboundOrder"("orderNo");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Location_code_key" ON "Location"("code");
