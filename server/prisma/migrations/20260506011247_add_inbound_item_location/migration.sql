-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CheckTask" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "warehouseId" INTEGER NOT NULL,
    "operatorId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "locationId" INTEGER,
    "parentTaskId" INTEGER,
    "note" TEXT,
    "reviewNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CheckTask_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CheckTask_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CheckTask_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CheckTask_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "CheckTask" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CheckTask" ("createdAt", "id", "locationId", "note", "operatorId", "status", "warehouseId") SELECT "createdAt", "id", "locationId", "note", "operatorId", "status", "warehouseId" FROM "CheckTask";
DROP TABLE "CheckTask";
ALTER TABLE "new_CheckTask" RENAME TO "CheckTask";
CREATE TABLE "new_InboundItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "inboundId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" REAL,
    "locationId" INTEGER,
    CONSTRAINT "InboundItem_inboundId_fkey" FOREIGN KEY ("inboundId") REFERENCES "InboundOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InboundItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InboundItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_InboundItem" ("id", "inboundId", "productId", "quantity", "unitPrice") SELECT "id", "inboundId", "productId", "quantity", "unitPrice" FROM "InboundItem";
DROP TABLE "InboundItem";
ALTER TABLE "new_InboundItem" RENAME TO "InboundItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
