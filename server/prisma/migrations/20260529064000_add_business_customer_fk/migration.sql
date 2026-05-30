-- Add businessCustomerId to Contract and Container
-- SQLite: need to recreate tables to add NOT NULL column with FK

-- Contract
CREATE TABLE "new_Contract" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "contractNo" TEXT NOT NULL,
    "customerId" INTEGER NOT NULL,
    "businessCustomerId" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Contract_contractNo_key" UNIQUE ("contractNo"),
    CONSTRAINT "Contract_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Contract_businessCustomerId_fkey" FOREIGN KEY ("businessCustomerId") REFERENCES "BusinessCustomer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Contract" SELECT "id", "contractNo", "customerId", COALESCE((SELECT "id" FROM "BusinessCustomer" LIMIT 1), 0), "status", "createdAt", "updatedAt" FROM "Contract";
DROP TABLE "Contract";
ALTER TABLE "new_Contract" RENAME TO "Contract";
CREATE INDEX "Contract_customerId_idx" ON "Contract"("customerId");
CREATE INDEX "Contract_businessCustomerId_idx" ON "Contract"("businessCustomerId");
CREATE INDEX "Contract_status_idx" ON "Contract"("status");

-- Container
CREATE TABLE "new_Container" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "containerNo" TEXT NOT NULL,
    "toYardTime" DATETIME,
    "sealTime" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "customerId" INTEGER NOT NULL,
    "businessCustomerId" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Container_containerNo_key" UNIQUE ("containerNo"),
    CONSTRAINT "Container_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Container_businessCustomerId_fkey" FOREIGN KEY ("businessCustomerId") REFERENCES "BusinessCustomer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Container" SELECT "id", "containerNo", "toYardTime", "sealTime", "status", "note", "customerId", COALESCE((SELECT "id" FROM "BusinessCustomer" LIMIT 1), 0), "createdAt", "updatedAt" FROM "Container";
DROP TABLE "Container";
ALTER TABLE "new_Container" RENAME TO "Container";
CREATE INDEX "Container_customerId_idx" ON "Container"("customerId");
CREATE INDEX "Container_businessCustomerId_idx" ON "Container"("businessCustomerId");
CREATE INDEX "Container_status_idx" ON "Container"("status");
