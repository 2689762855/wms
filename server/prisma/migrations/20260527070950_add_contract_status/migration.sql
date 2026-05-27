-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Contract" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "contractNo" TEXT NOT NULL,
    "customerId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Contract_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Contract" ("contractNo", "createdAt", "customerId", "id", "updatedAt") SELECT "contractNo", "createdAt", "customerId", "id", "updatedAt" FROM "Contract";
DROP TABLE "Contract";
ALTER TABLE "new_Contract" RENAME TO "Contract";
CREATE UNIQUE INDEX "Contract_contractNo_key" ON "Contract"("contractNo");
CREATE INDEX "Contract_customerId_idx" ON "Contract"("customerId");
CREATE INDEX "Contract_status_idx" ON "Contract"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
