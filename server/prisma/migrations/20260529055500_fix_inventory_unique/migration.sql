-- Fix Inventory unique constraint to include batchNo

CREATE TABLE "new_Inventory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productId" INTEGER NOT NULL,
    "warehouseId" INTEGER NOT NULL,
    "locationId" INTEGER,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "batchNo" TEXT,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Inventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Inventory_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Inventory_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Inventory" ("id", "productId", "warehouseId", "locationId", "quantity", "batchNo", "updatedAt")
SELECT "id", "productId", "warehouseId", "locationId", "quantity", "batchNo", COALESCE("updatedAt", CURRENT_TIMESTAMP) FROM "Inventory";

DROP TABLE "Inventory";

ALTER TABLE "new_Inventory" RENAME TO "Inventory";

CREATE UNIQUE INDEX "Inventory_productId_warehouseId_locationId_batchNo_key" ON "Inventory"("productId", "warehouseId", "locationId", "batchNo");

CREATE INDEX "Inventory_warehouseId_idx" ON "Inventory"("warehouseId");
CREATE INDEX "Inventory_productId_idx" ON "Inventory"("productId");
CREATE INDEX "Inventory_quantity_idx" ON "Inventory"("quantity");
