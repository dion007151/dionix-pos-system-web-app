export type BusinessProfileId = 'ANTIQUE_PASABUY' | 'ANGELITOS_RESTO';

export type UserRole = 'Admin' | 'Staff' | 'Shopper';

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
}

export type OrderStatus =
  | 'WAITING_CONFIRMATION'
  | 'READY_TO_BUY'
  | 'BUYING_NOW'
  | 'BOUGHT'
  | 'COMPLETED'
  | 'CANCELLED';

export type ItemStatus =
  | 'PENDING'
  | 'PURCHASED'
  | 'BOUGHT_FROM_STOCK'
  | 'UNAVAILABLE'
  | 'REORDER'
  | 'CANCELLED';

export type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

export type PaymentMethod =
  | 'Cash'
  | 'GCash'
  | 'Maya'
  | 'BankTransfer'
  | 'COD'
  | 'Other';

export type DeliveryType = 'PICKUP' | 'DELIVERY';

export type ProductFeeType = 'STANDARD' | 'NONE' | 'MANUAL';

export interface Customer {
  id: string;
  code: string;
  name: string;
  phone: string;
  address: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
}

export interface Store {
  id: string;
  name: string;
  location?: string;
  category?: string;
  notes?: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productName: string;
  storeName?: string;
  category?: string;
  qty: number;
  unit: string;
  estimatedPrice: number;
  actualPrice?: number;
  status: ItemStatus;
  feeType: ProductFeeType;
  manualFeeAmount?: number;
  isFeeExempt?: boolean;
  notes?: string;
  barcode?: string;
  purchasedQty?: number;
  purchaseDate?: string;
}

export interface Payment {
  id: string;
  orderId: string;
  amount: number;
  method: PaymentMethod;
  referenceNo?: string;
  paymentDate: string;
  receivedBy?: string;
  notes?: string;
}

export interface Order {
  id: string;
  orderNo: string;
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  status: OrderStatus;
  deliveryType: DeliveryType;
  address: string;
  notes?: string;
  serviceFee: number;
  deliveryFee: number;
  discount: number;
  manualFeeOverride?: number;
  feeOverrideNote?: string;
  isFeeAdjusted?: boolean;
  items?: OrderItem[];
  payments?: Payment[];
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  store: string;
  price: number;
  costPrice?: number;
  unit: string;
  barcode?: string;
  isStockItem?: boolean;
  openingStock?: number;
  additionalStocks?: number;
  stockQuantity: number;
  minStockLevel?: number;
  feeType?: ProductFeeType;
  manualFeeAmount?: number;
}

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  timestamp: string;
  changeQty: number;
  newQuantity: number;
  note: string;
  orderId?: string;
}

export interface PasabuyRateTier {
  id?: string;
  minAmount: number;
  maxAmount?: number | null;
  fixedFee?: number | null;
  percentageFee?: number | null;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  expenseDate: string;
  notes?: string;
  createdBy?: string;
  createdAt: string;
}

// ── Restaurant Models (Angelito's Bar & Resto Grill) ─────────────────────────

export type RestoTableStatus = 'Available' | 'Occupied' | 'Reserved' | 'Billed';

export interface RestoTable {
  id: string;
  tableNumber: string;
  name: string;
  capacity: number;
  section: string; // Main Dining, Bar, VIP, Patio
  status: RestoTableStatus;
  currentOrderId?: string;
}

export interface RestoMenuItem {
  id: string;
  code: string;
  name: string;
  category: string; // Grill, Sizzling, Pulutan, Alcoholic, Drinks, Rice
  price: number;
  costPrice?: number;
  isAvailable: boolean;
  imageUrl?: string;
}

export interface RestoOrderItem {
  id: string;
  orderId: string;
  menuItemId: string;
  name: string;
  price: number;
  qty: number;
  specialInstructions?: string;
  kitchenStatus: 'Pending' | 'Cooking' | 'Ready' | 'Served';
  createdAt: string;
}

export interface RestoOrder {
  id: string;
  orderNo: string;
  tableId?: string;
  tableName?: string;
  orderType: 'Dine-In' | 'Take-Out';
  status: 'Open' | 'Billed' | 'Completed' | 'Cancelled';
  items: RestoOrderItem[];
  subtotal: number;
  serviceCharge: number;
  discount: number;
  total: number;
  paymentMethod?: PaymentMethod;
  isPaid: boolean;
  paidAt?: string;
  serverName?: string;
  notes?: string;
  createdAt: string;
}

export interface RestoInventoryItem {
  id: string;
  itemCode: string;
  name: string;
  category: string; // Meat, Liquor, Produce, Supplies
  quantity: number;
  unit: string;
  minStockLevel: number;
  costPrice: number;
}

export interface RestoStaff {
  id: string;
  staffCode: string;
  fullName: string;
  role: string;
  shift: string;
  contactNumber: string;
  isActive: boolean;
}
