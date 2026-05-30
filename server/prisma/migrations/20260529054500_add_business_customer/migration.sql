-- CreateTable
CREATE TABLE "BusinessCustomer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "realName" TEXT NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BusinessCustomer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessCustomer_realName_tenantId_key" ON "BusinessCustomer"("realName", "tenantId");

-- CreateIndex
CREATE INDEX "BusinessCustomer_tenantId_idx" ON "BusinessCustomer"("tenantId");
