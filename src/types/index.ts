export type BusinessProfileId = 'ANTIQUE_PASABUY' | 'ANGELITOS_RESTO';

export interface BusinessInfo {
  storeName: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  receiptFooter: string;
}

export const DEFAULT_BUSINESS_INFO: BusinessInfo = {
  storeName: 'ANTIQUE PASABUY & RETAIL',
  tagline: 'YOUR SHOPPER',
  address: 'San Angel, San Jose de Buenavista, Antique 5700',
  phone: '09054853573',
  email: 'ellimac07161993@gmail.com',
  receiptFooter: '*** OFFICIAL RECEIPT ***'
};

export type UserRole = 'Admin' | 'Staff' | 'Shopper';

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  password?: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  username: string;
  fullName: string;
  role: string;
  action: string;         // e.g. 'LOGIN', 'LOGOUT', 'VIEW_DASHBOARD', etc.
  details?: string;       // extra description
  timestamp: string;      // ISO 8601
  sessionId: string;      // unique per login session
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
  | 'BACKORDER'
  | 'ALTERNATIVE_SELECTED'
  | 'AVAILABLE_AGAIN'
  | 'CANCELLED';

export interface AvailabilityHistoryEntry {
  action: string;
  at: string;
  by: string;
  reason?: string;
  expectedRestockDate?: string;
  alternativeProductId?: string;
  alternativeProductName?: string;
  alternativeSupplier?: string;
  alternativePrice?: number;
  priceDifference?: number;
  requiresStaffAction?: boolean;
  customerDecision?: 'ACCEPTED' | 'DECLINED' | 'PENDING';
  previousStatus?: ItemStatus;
  nextStatus?: ItemStatus;
  affectedOrderNumbers?: string[];
}

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
  productId?: string;
  barcode?: string;
  purchasedQty?: number;
  purchaseDate?: string;
  unavailableReason?: string;
  unavailableAt?: string;
  unavailableBy?: string;
  expectedRestockDate?: string;
  selectedAlternativeProductId?: string;
  selectedAlternativeProductName?: string;
  selectedAlternativeSupplier?: string;
  selectedAlternativePrice?: number;
  availabilityHistory?: AvailabilityHistoryEntry[];
  originalProductName?: string;
  originalProductId?: string;
  originalBarcode?: string;
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
  addressNote?: string;
  notes?: string;
  paymentMethod?: PaymentMethod;
  changeFor?: number;
  deliveryTime?: string;
  discountReason?: string;
  riderFeeIsCustomerCharge?: boolean;
  serviceFee: number;
  deliveryFee: number;
  discount: number;
  manualFeeOverride?: number;
  feeOverrideNote?: string;
  isFeeAdjusted?: boolean;
  customPasabuyFeeMode?: 'FIXED' | 'PERCENT';
  customPasabuyFeeValue?: number;
  additionalFeeMode?: 'FIXED' | 'PERCENT';
  additionalFeeValue?: number;
  additionalFeeNote?: string;
  items?: OrderItem[];
  payments?: Payment[];
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  isArchived?: boolean;
  archivedAt?: string;
  archivedBy?: string;
  archivedFrom?: 'Order List' | 'Live Buying List';
  archiveHistory?: Array<{ action: 'ARCHIVED' | 'RESTORED' | 'PERMANENTLY_DELETED'; at: string; by: string }>;
  source?: string;
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
  supplier?: string;
  description?: string;
  isStockItem?: boolean;
  openingStock?: number;
  additionalStocks?: number;
  stockQuantity: number;
  minStockLevel?: number;
  feeType?: ProductFeeType;
  manualFeeAmount?: number;
  imageUrl?: string;
  imageSource?: 'upload' | 'open-food-facts' | 'catalog';
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
  reference?: string;
  movementType?: 'STOCK_IN' | 'STOCK_OUT' | 'ADJUSTMENT';
  supplier?: string;
  unitCost?: number;
  receivedDate?: string;
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
