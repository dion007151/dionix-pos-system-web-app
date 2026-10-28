import Dexie, { Table } from 'dexie';
import {
  User,
  Customer,
  Store,
  Order,
  OrderItem,
  Payment,
  Product,
  Expense,
  PasabuyRateTier,
  StockMovement,
  RestoTable,
  RestoMenuItem,
  RestoOrder,
  RestoInventoryItem,
  RestoStaff
} from '../types';
import { DEFAULT_RATE_TIERS } from '../services/calc';

export interface SettingItem {
  key: string;
  value: string;
}

export class PosDatabase extends Dexie {
  users!: Table<User, string>;
  customers!: Table<Customer, string>;
  stores!: Table<Store, string>;
  orders!: Table<Order, string>;
  orderItems!: Table<OrderItem, string>;
  payments!: Table<Payment, string>;
  products!: Table<Product, string>;
  expenses!: Table<Expense, string>;
  rateTiers!: Table<PasabuyRateTier, number>;
  settings!: Table<SettingItem, string>;
  stockMovements!: Table<StockMovement, string>;

  // Restaurant Mode Tables
  restoTables!: Table<RestoTable, string>;
  restoMenuItems!: Table<RestoMenuItem, string>;
  restoOrders!: Table<RestoOrder, string>;
  restoInventory!: Table<RestoInventoryItem, string>;
  restoStaff!: Table<RestoStaff, string>;

  constructor() {
    super('AntiquePasabuyPOS_DB');
    this.version(2).stores({
      users: 'id, username, role, isActive',
      customers: 'id, code, name, phone, isActive, createdAt',
      stores: 'id, name, category',
      orders: 'id, orderNo, customerId, status, deliveryType, createdAt, updatedAt',
      orderItems: 'id, orderId, productName, status, feeType',
      payments: 'id, orderId, paymentDate, method',
      products: 'id, name, category, store, barcode, isStockItem',
      expenses: 'id, description, category, expenseDate, createdAt',
      rateTiers: '++id, minAmount',
      settings: 'key',
      stockMovements: 'id, productId, timestamp',
      restoTables: 'id, tableNumber, section, status',
      restoMenuItems: 'id, code, name, category, isAvailable',
      restoOrders: 'id, orderNo, tableId, orderType, status, isPaid, createdAt',
      restoInventory: 'id, itemCode, name, category',
      restoStaff: 'id, staffCode, fullName, role, isActive'
    });
  }
}

export const db = new PosDatabase();

/**
 * Initializes database with default data if empty
 */
export async function seedInitialDatabase() {
  const seeded = await db.settings.get('has_seeded_initial_data');
  if (seeded && seeded.value === 'true') {
    return;
  }

  // 1. Users
  const userCount = await db.users.count();
  if (userCount === 0) {
    await db.users.bulkAdd([
      { id: 'usr-1', username: 'admin', fullName: 'Administrator', role: 'Admin', isActive: true },
      { id: 'usr-2', username: 'cashier', fullName: 'Maria Santos (Staff)', role: 'Staff', isActive: true },
      { id: 'usr-3', username: 'rider', fullName: 'John Doe (Rider/Shopper)', role: 'Shopper', isActive: true }
    ]);
  }

  // 2. Settings & Tiers
  await db.settings.put({ key: 'business_name', value: 'DIONIX POS' });
  await db.settings.put({ key: 'receipt_footer', value: 'Thank you for trusting Antique Pasabuy!' });
  await db.settings.put({ key: 'active_business_profile', value: 'ANTIQUE_PASABUY' });

  const tiersCount = await db.rateTiers.count();
  if (tiersCount === 0) {
    await db.rateTiers.bulkAdd(DEFAULT_RATE_TIERS);
  }

  // 3. Customers
  const customerCount = await db.customers.count();
  if (customerCount === 0) {
    await db.customers.bulkAdd([
      { id: 'c-1', code: 'CUST-001', name: 'Dionimar Flores', phone: '0917-888-1234', address: 'Brgy. Funda-Dalipe, San Jose de Buenavista, Antique', notes: 'Preferred afternoon delivery', isActive: true, createdAt: new Date().toISOString() },
      { id: 'c-2', code: 'CUST-002', name: 'Elena Ramos', phone: '0928-555-4321', address: 'Brgy. District 1, Sibalom, Antique', notes: 'Near Sibalom Public Market', isActive: true, createdAt: new Date().toISOString() },
      { id: 'c-3', code: 'CUST-003', name: 'Roberto Gomez', phone: '0919-333-8765', address: 'Brgy. Poblacion 3, Hamtic, Antique', notes: 'Yellow gate near Chapel', isActive: true, createdAt: new Date().toISOString() },
      { id: 'c-4', code: 'CUST-004', name: 'Ana Reyes', phone: '0920-111-2345', address: 'Brgy. Poblacion, Belison, Antique', notes: 'Regular medicine pasabuy client', isActive: true, createdAt: new Date().toISOString() },
      { id: 'c-5', code: 'CUST-005', name: 'Juan Dela Cruz', phone: '0918-999-7788', address: 'Brgy. San Fernando, San Jose, Antique', notes: 'Call before arriving', isActive: true, createdAt: new Date().toISOString() }
    ]);
  }

  // 4. Stores
  const storeCount = await db.stores.count();
  if (storeCount === 0) {
    await db.stores.bulkAdd([
      { id: 's-1', name: 'SM', location: 'San Jose de Buenavista', category: 'Department Store / Supermarket', notes: 'Major weekly pasabuy stop' },
      { id: 's-2', name: 'Robinsons', location: 'San Jose de Buenavista', category: 'Supermarket / Department Store', notes: 'Robinsons Supermarket & Mall' },
      { id: 's-3', name: 'Grocery Store', location: 'San Jose de Buenavista', category: 'Grocery', notes: 'Puregold & local supermarkets' },
      { id: 's-4', name: 'Mercury Drug', location: 'Poblacion, San Jose', category: 'Pharmacy', notes: 'Prescriptions & OTC vitamins' },
      { id: 's-5', name: 'Bakery', location: 'San Jose de Buenavista', category: 'Bakery', notes: 'Tibiao Bakery & Red Ribbon' },
      { id: 's-6', name: 'Fast Food', location: 'San Jose Town Center', category: 'Fast Food', notes: 'Jollibee, Mang Inasal, Chowking' },
      { id: 's-7', name: 'Other Stores in Antique', location: 'Antique', category: 'General Store', notes: 'Specialty shops & wet markets' }
    ]);
  }

  // 5. Products
  const prodCount = await db.products.count();
  if (prodCount === 0) {
    await db.products.bulkAdd([
      { id: 'p-1', name: 'Jollibee 6pc Chickenjoy Bucket', category: 'Fastfood', store: 'Fast Food', price: 450, costPrice: 380, unit: 'bucket', barcode: '4800016644862', isStockItem: false, openingStock: 0, stockQuantity: 0, additionalStocks: 0, minStockLevel: 0 },
      { id: 'p-2', name: 'Jollibee Jolly Spaghetti Family Pan', category: 'Fastfood', store: 'Fast Food', price: 250, costPrice: 200, unit: 'pan', barcode: '4800016644879', isStockItem: false, openingStock: 0, stockQuantity: 0, additionalStocks: 0, minStockLevel: 0 },
      { id: 'p-3', name: 'Mang Inasal Chicken Inasal Paa Meal', category: 'Fastfood', store: 'Fast Food', price: 165, costPrice: 135, unit: 'meal', barcode: '4800016644886', isStockItem: false, openingStock: 0, stockQuantity: 0, additionalStocks: 0, minStockLevel: 0 },
      { id: 'p-4', name: 'Chowking Pork Chaofan w/ Siomai', category: 'Fastfood', store: 'Fast Food', price: 135, costPrice: 110, unit: 'meal', barcode: '4800016644893', isStockItem: false, openingStock: 0, stockQuantity: 0, additionalStocks: 0, minStockLevel: 0 },
      { id: 'p-5', name: 'SM Bonus Sugar 1kg', category: 'Groceries', store: 'SM', price: 78, costPrice: 62, unit: 'pack', barcode: '4800016644800', isStockItem: true, openingStock: 50, stockQuantity: 42, additionalStocks: 10, minStockLevel: 10 },
      { id: 'p-6', name: 'SM Premium White Bread', category: 'Bakery', store: 'SM', price: 65, costPrice: 50, unit: 'pack', barcode: '4800016644817', isStockItem: true, openingStock: 40, stockQuantity: 28, additionalStocks: 0, minStockLevel: 8 },
      { id: 'p-7', name: 'Robinsons Supermarket Fresh Milk 1L', category: 'Groceries', store: 'Robinsons', price: 98, costPrice: 78, unit: 'carton', barcode: '4800016644824', isStockItem: true, openingStock: 30, stockQuantity: 14, additionalStocks: 5, minStockLevel: 10 },
      { id: 'p-8', name: 'Mercury Drug Biogesic 500mg (10 tabs)', category: 'Pharmacy', store: 'Mercury Drug', price: 85, costPrice: 65, unit: 'blister', barcode: '4800016644831', isStockItem: true, openingStock: 100, stockQuantity: 65, additionalStocks: 20, minStockLevel: 15 },
      { id: 'p-9', name: 'Red Ribbon Black Forest Cake', category: 'Bakery', store: 'Bakery', price: 550, costPrice: 480, unit: 'cake', barcode: '4800016644848', isStockItem: true, openingStock: 8, stockQuantity: 3, additionalStocks: 0, minStockLevel: 4 }
    ]);

    // Initial Stock Movements
    await db.stockMovements.bulkAdd([
      { id: 'sm-1', productId: 'p-5', productName: 'SM Bonus Sugar 1kg', timestamp: new Date().toISOString(), changeQty: 50, newQuantity: 50, note: 'Initial Opening Stock' },
      { id: 'sm-2', productId: 'p-5', productName: 'SM Bonus Sugar 1kg', timestamp: new Date().toISOString(), changeQty: 10, newQuantity: 60, note: 'Restock: Delivery from SM wholesale' },
      { id: 'sm-3', productId: 'p-5', productName: 'SM Bonus Sugar 1kg', timestamp: new Date().toISOString(), changeQty: -18, newQuantity: 42, note: 'Dispatched to Pasabuy orders' },
      { id: 'sm-4', productId: 'p-9', productName: 'Red Ribbon Black Forest Cake', timestamp: new Date().toISOString(), changeQty: 8, newQuantity: 8, note: 'Initial Opening Stock' },
      { id: 'sm-5', productId: 'p-9', productName: 'Red Ribbon Black Forest Cake', timestamp: new Date().toISOString(), changeQty: -5, newQuantity: 3, note: 'Fulfilled orders (Low Stock)' }
    ]);
  }

  // 6. Expenses
  const expCount = await db.expenses.count();
  if (expCount === 0) {
    const today = new Date().toISOString().split('T')[0];
    await db.expenses.bulkAdd([
      { id: 'e-1', description: 'Rider Motorcycle Fuel (San Jose to Sibalom)', amount: 250, category: 'Fuel', expenseDate: today, notes: 'Full tank for shopping runs', createdAt: new Date().toISOString() },
      { id: 'e-2', description: 'Thermal Receipt Paper Roll (Pack of 5)', amount: 150, category: 'Supplies', expenseDate: today, notes: '80mm POS receipt paper', createdAt: new Date().toISOString() },
      { id: 'e-3', description: 'Mall & Supermarket Parking Fees', amount: 60, category: 'Transportation', expenseDate: today, notes: 'Robinsons & Gaisano parking', createdAt: new Date().toISOString() }
    ]);
  }

  // 7. Initial Demo Order
  const orderCount = await db.orders.count();
  if (orderCount === 0) {
    const orderId = 'ord-demo-1';
    await db.orders.add({
      id: orderId,
      orderNo: 'ORD-2026-0001',
      customerId: 'c-1',
      customerName: 'Dionimar Flores',
      customerPhone: '0917-888-1234',
      status: 'READY_TO_BUY',
      deliveryType: 'DELIVERY',
      address: 'Brgy. Funda-Dalipe, San Jose de Buenavista, Antique',
      notes: 'Please double-check chicken is spicy.',
      serviceFee: 150,
      deliveryFee: 50,
      discount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    await db.orderItems.bulkAdd([
      {
        id: 'item-1',
        orderId,
        productName: 'Jollibee 6pc Chickenjoy Bucket',
        storeName: 'Fast Food',
        category: 'Fastfood',
        qty: 1,
        unit: 'bucket',
        estimatedPrice: 450,
        status: 'PENDING',
        feeType: 'STANDARD'
      },
      {
        id: 'item-2',
        orderId,
        productName: 'SM Bonus Sugar 1kg',
        storeName: 'SM',
        category: 'Groceries',
        qty: 2,
        unit: 'pack',
        estimatedPrice: 78,
        status: 'PENDING',
        feeType: 'STANDARD'
      }
    ]);
  }

  // 8. Restaurant Tables
  const tableCount = await db.restoTables.count();
  if (tableCount === 0) {
    await db.restoTables.bulkAdd([
      { id: 't-1', tableNumber: 'T-01', name: 'Table 1', capacity: 4, section: 'Main Dining', status: 'Available' },
      { id: 't-2', tableNumber: 'T-02', name: 'Table 2', capacity: 4, section: 'Main Dining', status: 'Available' },
      { id: 't-3', tableNumber: 'T-03', name: 'Table 3', capacity: 6, section: 'Main Dining', status: 'Available' },
      { id: 't-4', tableNumber: 'T-04', name: 'Table 4', capacity: 6, section: 'Main Dining', status: 'Available' },
      { id: 't-5', tableNumber: 'BAR-01', name: 'Bar Counter 1', capacity: 2, section: 'Bar', status: 'Available' },
      { id: 't-6', tableNumber: 'VIP-01', name: 'VIP Suite', capacity: 10, section: 'VIP', status: 'Available' },
      { id: 't-7', tableNumber: 'PATIO-01', name: 'Patio Garden', capacity: 4, section: 'Patio', status: 'Available' }
    ]);
  }

  // 9. Restaurant Menu Items
  const menuCount = await db.restoMenuItems.count();
  if (menuCount === 0) {
    await db.restoMenuItems.bulkAdd([
      { id: 'rm-1', code: 'GRL-01', name: 'Inihaw na Liempo (Pork Belly)', category: 'Grill', price: 185, costPrice: 110, isAvailable: true },
      { id: 'rm-2', code: 'GRL-02', name: 'Chicken Inasal (Leg Quarter)', category: 'Grill', price: 165, costPrice: 90, isAvailable: true },
      { id: 'rm-3', code: 'GRL-03', name: 'Grilled Tuna Panga (500g)', category: 'Grill', price: 280, costPrice: 160, isAvailable: true },
      { id: 'rm-4', code: 'SIZ-01', name: 'Sizzling Pork Sisig with Egg', category: 'Sizzling', price: 195, costPrice: 100, isAvailable: true },
      { id: 'rm-5', code: 'SIZ-02', name: 'Sizzling Spicy Gambas', category: 'Sizzling', price: 240, costPrice: 135, isAvailable: true },
      { id: 'rm-6', code: 'PUL-01', name: 'Crispy Pata (Jumbo)', category: 'Pulutan', price: 580, costPrice: 330, isAvailable: true },
      { id: 'rm-7', code: 'ALC-01', name: 'San Miguel Pale Pilsen 330ml', category: 'Alcoholic', price: 75, costPrice: 48, isAvailable: true },
      { id: 'rm-8', code: 'ALC-02', name: 'Red Horse Beer 500ml', category: 'Alcoholic', price: 95, costPrice: 62, isAvailable: true },
      { id: 'rm-9', code: 'DRK-01', name: 'House Blend Iced Tea (Pitcher)', category: 'Drinks', price: 95, costPrice: 35, isAvailable: true },
      { id: 'rm-10', code: 'RCE-01', name: 'Steamed Plain Rice (Cup)', category: 'Rice', price: 25, costPrice: 8, isAvailable: true },
      { id: 'rm-11', code: 'RCE-02', name: 'Garlic Fried Rice (Platter)', category: 'Rice', price: 110, costPrice: 35, isAvailable: true }
    ]);
  }

  // 10. Restaurant Staff & Inventory
  const staffCount = await db.restoStaff.count();
  if (staffCount === 0) {
    await db.restoStaff.bulkAdd([
      { id: 'stf-1', staffCode: 'STF-01', fullName: 'Chef Roberto Cruz', role: 'Head Chef', shift: 'Afternoon/Evening', contactNumber: '0917-111-2233', isActive: true },
      { id: 'stf-2', staffCode: 'STF-02', fullName: 'Angela Reyes', role: 'Head Server', shift: 'Evening', contactNumber: '0918-222-3344', isActive: true }
    ]);
  }

  const restoInvCount = await db.restoInventory.count();
  if (restoInvCount === 0) {
    await db.restoInventory.bulkAdd([
      { id: 'ri-1', itemCode: 'INV-MT-01', name: 'Pork Liempo Slab', category: 'Meat', quantity: 28, unit: 'kg', minStockLevel: 8, costPrice: 290 },
      { id: 'ri-2', itemCode: 'INV-MT-02', name: 'Chicken Leg Quarter', category: 'Meat', quantity: 35, unit: 'kg', minStockLevel: 10, costPrice: 185 },
      { id: 'ri-3', itemCode: 'INV-BV-01', name: 'San Miguel Pale Pilsen Case', category: 'Liquor', quantity: 18, unit: 'case', minStockLevel: 4, costPrice: 1100 }
    ]);
  }

  await db.settings.put({ key: 'has_seeded_initial_data', value: 'true' });
}

/**
 * Exports entire IndexedDB into a JSON file for 1-click local backup
 */
export async function exportDatabaseToJson(): Promise<string> {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    users: await db.users.toArray(),
    customers: await db.customers.toArray(),
    stores: await db.stores.toArray(),
    orders: await db.orders.toArray(),
    orderItems: await db.orderItems.toArray(),
    payments: await db.payments.toArray(),
    products: await db.products.toArray(),
    expenses: await db.expenses.toArray(),
    rateTiers: await db.rateTiers.toArray(),
    settings: await db.settings.toArray(),
    stockMovements: await db.stockMovements.toArray(),
    restoTables: await db.restoTables.toArray(),
    restoMenuItems: await db.restoMenuItems.toArray(),
    restoOrders: await db.restoOrders.toArray(),
    restoInventory: await db.restoInventory.toArray(),
    restoStaff: await db.restoStaff.toArray()
  };

  return JSON.stringify(data, null, 2);
}

/**
 * Imports a JSON file into IndexedDB with full overwrite/merge safety
 */
export async function importDatabaseFromJson(jsonString: string): Promise<boolean> {
  try {
    const data = JSON.parse(jsonString);
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid JSON backup format');
    }

    await db.transaction('rw', [
      db.users,
      db.customers,
      db.stores,
      db.orders,
      db.orderItems,
      db.payments,
      db.products,
      db.expenses,
      db.rateTiers,
      db.settings,
      db.stockMovements,
      db.restoTables,
      db.restoMenuItems,
      db.restoOrders,
      db.restoInventory,
      db.restoStaff
    ], async () => {
      if (Array.isArray(data.users)) {
        await db.users.clear();
        await db.users.bulkAdd(data.users);
      }
      if (Array.isArray(data.customers)) {
        await db.customers.clear();
        await db.customers.bulkAdd(data.customers);
      }
      if (Array.isArray(data.stores)) {
        await db.stores.clear();
        await db.stores.bulkAdd(data.stores);
      }
      if (Array.isArray(data.orders)) {
        await db.orders.clear();
        await db.orders.bulkAdd(data.orders);
      }
      if (Array.isArray(data.orderItems)) {
        await db.orderItems.clear();
        await db.orderItems.bulkAdd(data.orderItems);
      }
      if (Array.isArray(data.payments)) {
        await db.payments.clear();
        await db.payments.bulkAdd(data.payments);
      }
      if (Array.isArray(data.products)) {
        await db.products.clear();
        await db.products.bulkAdd(data.products);
      }
      if (Array.isArray(data.expenses)) {
        await db.expenses.clear();
        await db.expenses.bulkAdd(data.expenses);
      }
      if (Array.isArray(data.rateTiers)) {
        await db.rateTiers.clear();
        await db.rateTiers.bulkAdd(data.rateTiers);
      }
      if (Array.isArray(data.settings)) {
        await db.settings.clear();
        await db.settings.bulkAdd(data.settings);
      }
      if (Array.isArray(data.stockMovements)) {
        await db.stockMovements.clear();
        await db.stockMovements.bulkAdd(data.stockMovements);
      }
      if (Array.isArray(data.restoTables)) {
        await db.restoTables.clear();
        await db.restoTables.bulkAdd(data.restoTables);
      }
      if (Array.isArray(data.restoMenuItems)) {
        await db.restoMenuItems.clear();
        await db.restoMenuItems.bulkAdd(data.restoMenuItems);
      }
      if (Array.isArray(data.restoOrders)) {
        await db.restoOrders.clear();
        await db.restoOrders.bulkAdd(data.restoOrders);
      }
      if (Array.isArray(data.restoInventory)) {
        await db.restoInventory.clear();
        await db.restoInventory.bulkAdd(data.restoInventory);
      }
      if (Array.isArray(data.restoStaff)) {
        await db.restoStaff.clear();
        await db.restoStaff.bulkAdd(data.restoStaff);
      }
    });

    return true;
  } catch (err) {
    console.error('Failed to import backup:', err);
    throw err;
  }
}

/**
 * Inventory Helpers for Antique Pasabuy
 */
export async function addStock(productId: string, qty: number, note: string = 'Added stock') {
  if (qty <= 0) throw new Error('Quantity to add must be greater than zero');
  const product = await db.products.get(productId);
  if (!product) throw new Error('Product not found');

  const newQty = (product.stockQuantity || 0) + qty;
  const newAdditional = (product.additionalStocks || 0) + qty;

  await db.products.update(productId, {
    isStockItem: true,
    stockQuantity: newQty,
    additionalStocks: newAdditional
  });

  await db.stockMovements.add({
    id: 'sm-' + Math.random().toString(36).substring(2, 9),
    productId,
    productName: product.name,
    timestamp: new Date().toISOString(),
    changeQty: qty,
    newQuantity: newQty,
    note
  });

  return newQty;
}

export async function adjustStock(productId: string, newQty: number, note: string) {
  if (newQty < 0) throw new Error('Stock quantity cannot be negative');
  if (!note || !note.trim()) throw new Error('A reason note is required for adjustments');
  const product = await db.products.get(productId);
  if (!product) throw new Error('Product not found');

  const oldQty = product.stockQuantity || 0;
  const diff = newQty - oldQty;

  await db.products.update(productId, {
    isStockItem: true,
    stockQuantity: newQty
  });

  await db.stockMovements.add({
    id: 'sm-' + Math.random().toString(36).substring(2, 9),
    productId,
    productName: product.name,
    timestamp: new Date().toISOString(),
    changeQty: diff,
    newQuantity: newQty,
    note: note.trim()
  });

  return newQty;
}

export async function recordSaleFromStock(productName: string, qty: number, orderId?: string, orderNo?: string) {
  if (!productName || qty <= 0) return false;
  const products = await db.products.toArray();
  const product = products.find(
    p => p.name.trim().toLowerCase() === productName.trim().toLowerCase() && p.isStockItem
  );
  if (!product) return false;

  const newQty = Math.max(0, (product.stockQuantity || 0) - qty);
  await db.products.update(product.id, {
    stockQuantity: newQty
  });

  await db.stockMovements.add({
    id: 'sm-' + Math.random().toString(36).substring(2, 9),
    productId: product.id,
    productName: product.name,
    timestamp: new Date().toISOString(),
    changeQty: -qty,
    newQuantity: newQty,
    note: orderNo ? `Fulfilled from Stock: ${orderNo}` : 'Fulfilled from Stock',
    orderId
  });

  return true;
}
