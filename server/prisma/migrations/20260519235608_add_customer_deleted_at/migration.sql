-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "deletedAt" DATETIME;

-- CreateIndex
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");

-- CreateIndex
CREATE INDEX "Category_customerId_idx" ON "Category"("customerId");

-- CreateIndex
CREATE INDEX "CheckItem_taskId_idx" ON "CheckItem"("taskId");

-- CreateIndex
CREATE INDEX "CheckTask_warehouseId_idx" ON "CheckTask"("warehouseId");

-- CreateIndex
CREATE INDEX "CheckTask_parentTaskId_idx" ON "CheckTask"("parentTaskId");

-- CreateIndex
CREATE INDEX "Customer_createdBy_idx" ON "Customer"("createdBy");

-- CreateIndex
CREATE INDEX "InboundItem_inboundId_idx" ON "InboundItem"("inboundId");

-- CreateIndex
CREATE INDEX "InboundOrder_warehouseId_idx" ON "InboundOrder"("warehouseId");

-- CreateIndex
CREATE INDEX "InboundOrder_status_idx" ON "InboundOrder"("status");

-- CreateIndex
CREATE INDEX "InboundOrder_createdAt_idx" ON "InboundOrder"("createdAt");

-- CreateIndex
CREATE INDEX "Inventory_warehouseId_idx" ON "Inventory"("warehouseId");

-- CreateIndex
CREATE INDEX "Inventory_productId_idx" ON "Inventory"("productId");

-- CreateIndex
CREATE INDEX "Inventory_quantity_idx" ON "Inventory"("quantity");

-- CreateIndex
CREATE INDEX "Location_warehouseId_idx" ON "Location"("warehouseId");

-- CreateIndex
CREATE INDEX "OutboundItem_outboundId_idx" ON "OutboundItem"("outboundId");

-- CreateIndex
CREATE INDEX "OutboundOrder_warehouseId_idx" ON "OutboundOrder"("warehouseId");

-- CreateIndex
CREATE INDEX "OutboundOrder_status_idx" ON "OutboundOrder"("status");

-- CreateIndex
CREATE INDEX "OutboundOrder_createdAt_idx" ON "OutboundOrder"("createdAt");

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");

-- CreateIndex
CREATE INDEX "Product_barcode_idx" ON "Product"("barcode");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "Product_customerId_idx" ON "Product"("customerId");

-- CreateIndex
CREATE INDEX "StockLog_productId_idx" ON "StockLog"("productId");

-- CreateIndex
CREATE INDEX "StockLog_warehouseId_idx" ON "StockLog"("warehouseId");

-- CreateIndex
CREATE INDEX "StockLog_createdAt_idx" ON "StockLog"("createdAt");

-- CreateIndex
CREATE INDEX "TransferItem_transferId_idx" ON "TransferItem"("transferId");

-- CreateIndex
CREATE INDEX "TransferOrder_fromWarehouseId_idx" ON "TransferOrder"("fromWarehouseId");

-- CreateIndex
CREATE INDEX "TransferOrder_toWarehouseId_idx" ON "TransferOrder"("toWarehouseId");

-- CreateIndex
CREATE INDEX "TransferOrder_status_idx" ON "TransferOrder"("status");

-- CreateIndex
CREATE INDEX "User_warehouseId_idx" ON "User"("warehouseId");

-- CreateIndex
CREATE INDEX "User_createdById_idx" ON "User"("createdById");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "Warehouse_customerId_idx" ON "Warehouse"("customerId");
