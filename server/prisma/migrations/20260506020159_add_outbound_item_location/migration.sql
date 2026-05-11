-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OutboundItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "outboundId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "locationId" INTEGER,
    CONSTRAINT "OutboundItem_outboundId_fkey" FOREIGN KEY ("outboundId") REFERENCES "OutboundOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OutboundItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OutboundItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_OutboundItem" ("id", "outboundId", "productId", "quantity") SELECT "id", "outboundId", "productId", "quantity" FROM "OutboundItem";
DROP TABLE "OutboundItem";
ALTER TABLE "new_OutboundItem" RENAME TO "OutboundItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
