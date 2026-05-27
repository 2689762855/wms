-- CreateTable
CREATE TABLE "Contract" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "contractNo" TEXT NOT NULL,
    "customerId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Contract_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContractItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "contractId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "plannedQty" INTEGER NOT NULL,
    "receivedQty" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ContractItem_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContractItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Container" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "containerNo" TEXT NOT NULL,
    "toYardTime" DATETIME,
    "sealTime" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "customerId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Container_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContainerItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "containerId" INTEGER NOT NULL,
    "outboundId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "plannedQty" INTEGER NOT NULL,
    "actualQty" INTEGER,
    "returnedQty" INTEGER NOT NULL DEFAULT 0,
    "locationId" INTEGER,
    CONSTRAINT "ContainerItem_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContainerItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ContainerItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_InboundItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "inboundId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" REAL,
    "locationId" INTEGER,
    "expiryDate" DATETIME,
    "contractId" INTEGER,
    CONSTRAINT "InboundItem_inboundId_fkey" FOREIGN KEY ("inboundId") REFERENCES "InboundOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InboundItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InboundItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InboundItem_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_InboundItem" ("expiryDate", "id", "inboundId", "locationId", "productId", "quantity", "unitPrice") SELECT "expiryDate", "id", "inboundId", "locationId", "productId", "quantity", "unitPrice" FROM "InboundItem";
DROP TABLE "InboundItem";
ALTER TABLE "new_InboundItem" RENAME TO "InboundItem";
CREATE INDEX "InboundItem_inboundId_idx" ON "InboundItem"("inboundId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Contract_contractNo_key" ON "Contract"("contractNo");

-- CreateIndex
CREATE INDEX "Contract_customerId_idx" ON "Contract"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractItem_contractId_productId_key" ON "ContractItem"("contractId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Container_containerNo_key" ON "Container"("containerNo");

-- CreateIndex
CREATE INDEX "Container_customerId_idx" ON "Container"("customerId");

-- CreateIndex
CREATE INDEX "Container_status_idx" ON "Container"("status");

-- CreateIndex
CREATE INDEX "ContainerItem_outboundId_idx" ON "ContainerItem"("outboundId");

-- CreateIndex
CREATE INDEX "ContainerItem_containerId_idx" ON "ContainerItem"("containerId");
