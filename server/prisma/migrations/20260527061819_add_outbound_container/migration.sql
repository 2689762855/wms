-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OutboundOrder" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "orderNo" TEXT NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "receiver" TEXT,
    "operatorId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "locationId" INTEGER,
    "containerId" INTEGER,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OutboundOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OutboundOrder_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OutboundOrder_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OutboundOrder_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_OutboundOrder" ("createdAt", "id", "locationId", "note", "operatorId", "orderNo", "receiver", "status", "warehouseId") SELECT "createdAt", "id", "locationId", "note", "operatorId", "orderNo", "receiver", "status", "warehouseId" FROM "OutboundOrder";
DROP TABLE "OutboundOrder";
ALTER TABLE "new_OutboundOrder" RENAME TO "OutboundOrder";
CREATE UNIQUE INDEX "OutboundOrder_orderNo_key" ON "OutboundOrder"("orderNo");
CREATE INDEX "OutboundOrder_warehouseId_idx" ON "OutboundOrder"("warehouseId");
CREATE INDEX "OutboundOrder_status_idx" ON "OutboundOrder"("status");
CREATE INDEX "OutboundOrder_createdAt_idx" ON "OutboundOrder"("createdAt");
CREATE INDEX "OutboundOrder_containerId_idx" ON "OutboundOrder"("containerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
