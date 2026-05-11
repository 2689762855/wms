-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CheckTask" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "warehouseId" INTEGER NOT NULL,
    "operatorId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "locationId" INTEGER,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CheckTask_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CheckTask_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CheckTask_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CheckTask" ("createdAt", "id", "note", "operatorId", "status", "warehouseId") SELECT "createdAt", "id", "note", "operatorId", "status", "warehouseId" FROM "CheckTask";
DROP TABLE "CheckTask";
ALTER TABLE "new_CheckTask" RENAME TO "CheckTask";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
