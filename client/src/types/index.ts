export interface User {
  id: number;
  username: string;
  role: 'super_admin' | 'warehouse_admin' | 'operator' | 'tenant_admin';
  realName?: string;
  phone?: string;
  warehouseId?: number | null;
  warehouse?: { id: number; name: string } | null;
  customerId?: number | null;
  status?: string;
  maxWarehouses?: number;
  warehouses?: { id: number; name: string }[];
  createdAt: string;
  createdBy?: { id: number; realName?: string | null; username: string } | null;
}

export interface CustomerInfo {
  id: number;
  username: string;
  realName?: string;
  status: string;
  maxWarehouses: number;
  expiresAt: string | null;
  warehouses: { id: number; name: string; createdAt: string }[];
  _count?: { products: number };
  createdByUser?: { id: number; realName?: string | null; username: string } | null;
  createdAt: string;
}

export interface Warehouse {
  id: number;
  name: string;
  address?: string;
  managerId?: number;
  createdAt: string;
}

export interface Category {
  id: number;
  name: string;
  parentId?: number;
  children?: Category[];
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  spec?: string;
  unit: string;
  barcode?: string;
  categoryId?: number;
  category?: Category;
  safetyStock: number;
  costPrice?: number;
  salePrice?: number;
  imageUrl?: string | null;
  warehouseSafetyStock?: number;
  productWarehouses?: ProductWarehouse[];
}

export interface ProductWarehouse {
  id: number;
  productId: number;
  product?: Product;
  warehouseId: number;
  warehouse?: { id: number; name: string };
  safetyStock: number;
}

export interface InventoryItem {
  id: number;
  productId: number;
  product: Product;
  warehouseId: number;
  warehouse: Warehouse;
  locationId?: number | null;
  location?: Location | null;
  quantity: number;
  updatedAt: string;
}

export interface StockLog {
  id: number;
  productId: number;
  product: Product;
  warehouseId: number;
  changeQty: number;
  beforeQty: number;
  afterQty: number;
  type: string;
  refId?: number;
  createdAt: string;
}

export interface Location {
  id: number;
  warehouseId: number;
  warehouse?: Warehouse;
  name: string;
  code: string;
  createdAt: string;
}

export interface InboundOrder {
  id: number;
  orderNo: string;
  warehouseId: number;
  warehouse?: Warehouse;
  supplier?: string;
  operatorId?: number;
  status: 'draft' | 'confirmed';
  locationId?: number | null;
  location?: Location | null;
  note?: string;
  createdAt: string;
  items: InboundItem[];
}

export interface InboundItem {
  id: number;
  inboundId: number;
  productId: number;
  product?: Product;
  quantity: number;
  unitPrice?: number;
  locationId?: number | null;
  location?: Location | null;
  expiryDate?: string | null;
}

export interface OutboundOrder {
  id: number;
  orderNo: string;
  warehouseId: number;
  warehouse?: Warehouse;
  receiver?: string;
  operatorId?: number;
  status: 'draft' | 'confirmed';
  locationId?: number | null;
  location?: Location | null;
  note?: string;
  createdAt: string;
  items: OutboundItem[];
}

export interface OutboundItem {
  id: number;
  outboundId: number;
  productId: number;
  product?: Product;
  quantity: number;
  locationId?: number | null;
  location?: Location | null;
}

export interface TransferOrder {
  id: number;
  orderNo: string;
  fromWarehouseId: number;
  fromWarehouse?: Warehouse;
  toWarehouseId: number;
  toWarehouse?: Warehouse;
  operatorId?: number;
  operator?: { id: number; realName?: string };
  status: 'draft' | 'pending' | 'approved' | 'rejected';
  note?: string;
  reviewedById?: number;
  reviewedBy?: { id: number; realName?: string } | null;
  reviewNote?: string;
  reviewedAt?: string;
  createdAt: string;
  items: TransferItem[];
}

export interface TransferItem {
  id: number;
  transferId: number;
  productId: number;
  product?: Product;
  quantity: number;
}

export interface CheckTask {
  id: number;
  warehouseId: number;
  warehouse?: Warehouse;
  operatorId?: number;
  status: 'in_progress' | 'completed' | 'anomaly';
  locationId?: number | null;
  location?: Location | null;
  parentTaskId?: number | null;
  parentTask?: CheckTask | null;
  subTasks?: CheckTask[];
  note?: string;
  reviewNote?: string | null;
  createdAt: string;
  items: CheckItem[];
}

export interface CheckItem {
  id: number;
  taskId: number;
  productId: number;
  product?: Product;
  systemQty: number;
  actualQty?: number;
  diffQty?: number;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AppVersion {
  versionCode: number;
  versionName: string;
  downloadUrl: string;
  changelog: string;
  forceUpdate: boolean;
  minVersionCode: number;
}
