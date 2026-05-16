/*
  Warnings:

  - You are about to drop the column `warehouseId` on the `Customer` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Category" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "parentId" INTEGER,
    "customerId" INTEGER,
    CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Category_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Category" ("id", "name", "parentId") SELECT "id", "name", "parentId" FROM "Category";
DROP TABLE "Category";
ALTER TABLE "new_Category" RENAME TO "Category";
CREATE TABLE "new_Customer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "realName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "maxWarehouses" INTEGER NOT NULL DEFAULT 1,
    "createdBy" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Customer" ("createdAt", "createdBy", "id", "passwordHash", "realName", "username") SELECT "createdAt", "createdBy", "id", "passwordHash", "realName", "username" FROM "Customer";
DROP TABLE "Customer";
ALTER TABLE "new_Customer" RENAME TO "Customer";
CREATE UNIQUE INDEX "Customer_username_key" ON "Customer"("username");
CREATE TABLE "new_Product" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "spec" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "barcode" TEXT,
    "categoryId" INTEGER,
    "customerId" INTEGER,
    "safetyStock" INTEGER NOT NULL DEFAULT 0,
    "costPrice" REAL,
    "salePrice" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Product_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("barcode", "categoryId", "costPrice", "createdAt", "id", "name", "safetyStock", "salePrice", "sku", "spec", "unit", "updatedAt") SELECT "barcode", "categoryId", "costPrice", "createdAt", "id", "name", "safetyStock", "salePrice", "sku", "spec", "unit", "updatedAt" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");
CREATE TABLE "new_Warehouse" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "managerId" INTEGER,
    "customerId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Warehouse_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Warehouse_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Warehouse" ("address", "createdAt", "id", "managerId", "name") SELECT "address", "createdAt", "id", "managerId", "name" FROM "Warehouse";
DROP TABLE "Warehouse";
ALTER TABLE "new_Warehouse" RENAME TO "Warehouse";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
