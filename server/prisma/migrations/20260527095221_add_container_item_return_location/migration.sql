-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ContainerItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "containerId" INTEGER NOT NULL,
    "outboundId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "plannedQty" INTEGER NOT NULL,
    "actualQty" INTEGER,
    "returnedQty" INTEGER NOT NULL DEFAULT 0,
    "locationId" INTEGER,
    "returnLocationId" INTEGER,
    CONSTRAINT "ContainerItem_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContainerItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ContainerItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ContainerItem_returnLocationId_fkey" FOREIGN KEY ("returnLocationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ContainerItem" ("actualQty", "containerId", "id", "locationId", "outboundId", "plannedQty", "productId", "returnedQty") SELECT "actualQty", "containerId", "id", "locationId", "outboundId", "plannedQty", "productId", "returnedQty" FROM "ContainerItem";
DROP TABLE "ContainerItem";
ALTER TABLE "new_ContainerItem" RENAME TO "ContainerItem";
CREATE INDEX "ContainerItem_outboundId_idx" ON "ContainerItem"("outboundId");
CREATE INDEX "ContainerItem_containerId_idx" ON "ContainerItem"("containerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
