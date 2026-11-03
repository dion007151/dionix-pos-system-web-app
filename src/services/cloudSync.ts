import { getSupabase } from './supabaseClient';
import { db } from '../db/db';
import { User, Order, Product, Customer } from '../types';

export const SUPABASE_SCHEMA_SQL = `-- Run this in Supabase SQL Editor (1-Click Setup)
CREATE TABLE IF NOT EXISTS public.pos_users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Staff',
  password TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pos_orders (
  id TEXT PRIMARY KEY,
  order_no TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  delivery_type TEXT,
  address TEXT,
  status TEXT NOT NULL,
  items JSONB DEFAULT '[]'::jsonb,
  data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pos_products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  store TEXT,
  price NUMERIC DEFAULT 0,
  cost_price NUMERIC DEFAULT 0,
  unit TEXT,
  barcode TEXT,
  is_stock_item BOOLEAN DEFAULT false,
  stock_quantity NUMERIC DEFAULT 0,
  min_stock_level NUMERIC DEFAULT 5,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pos_customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS) but allow authenticated/anon app access
ALTER TABLE public.pos_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_customers ENABLE ROW LEVEL SECURITY;

-- Allow read/write for POS client
CREATE POLICY "Allow all for pos_users" ON public.pos_users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for pos_orders" ON public.pos_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for pos_products" ON public.pos_products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for pos_customers" ON public.pos_customers FOR ALL USING (true) WITH CHECK (true);
`;

export async function testSupabaseConnection(): Promise<{ success: boolean; message: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { success: false, message: 'Supabase is not configured. Please enter your Project URL and Anon Key.' };
  }

  try {
    const { error } = await supabase.from('pos_users').select('id').limit(1);
    if (error) {
      if (error.code === '42P01') {
        return { success: false, message: 'Connected to Supabase, but the tables are not created yet. Please run the SQL schema script in your Supabase SQL Editor.' };
      }
      return { success: false, message: `Supabase error: ${error.message}` };
    }
    return { success: true, message: 'Connected to Supabase successfully!' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to connect to Supabase.' };
  }
}

/**
 * Uploads local users and orders to Supabase
 */
export async function pushLocalUsersToCloud(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const localUsers = await db.users.toArray();
  if (localUsers.length === 0) return;

  const rows = localUsers.map(u => ({
    id: u.id,
    username: u.username,
    full_name: u.fullName,
    role: u.role,
    password: u.password || '',
    is_active: u.isActive,
    updated_at: new Date().toISOString()
  }));

  const { error } = await supabase.from('pos_users').upsert(rows, { onConflict: 'id' });
  if (error) {
    console.warn('Failed to push users to Supabase:', error);
  }
}

/**
 * Pulls users from Supabase and merges into local IndexedDB
 */
export async function pullCloudUsersToLocal(): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;

  try {
    const { data, error } = await supabase.from('pos_users').select('*');
    if (error || !data) {
      console.warn('Failed to pull users from cloud:', error);
      return 0;
    }

    let addedCount = 0;
    for (const row of data) {
      const existing = await db.users.get(row.id);
      const userObj: User = {
        id: row.id,
        username: row.username,
        fullName: row.full_name,
        role: row.role as any,
        isActive: row.is_active ?? true,
        password: row.password
      };

      if (!existing) {
        await db.users.put(userObj);
        addedCount++;
      } else if (existing.password !== userObj.password || existing.role !== userObj.role || existing.fullName !== userObj.fullName) {
        await db.users.put(userObj);
      }
    }

    return addedCount;
  } catch (err) {
    console.warn('Error pulling users:', err);
    return 0;
  }
}

/**
 * Pushes local orders to cloud
 */
export async function pushLocalOrdersToCloud(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const localOrders = await db.orders.toArray();
  if (localOrders.length === 0) return;

  const rows = localOrders.map(o => ({
    id: o.id,
    order_no: o.orderNo,
    customer_name: o.customerName,
    customer_phone: o.customerPhone,
    delivery_type: o.deliveryType,
    address: o.address,
    status: o.status,
    items: o.items || [],
    data: o,
    created_at: o.createdAt || new Date().toISOString(),
    updated_at: o.updatedAt || new Date().toISOString()
  }));

  await supabase.from('pos_orders').upsert(rows, { onConflict: 'id' });
}

/**
 * Pulls cloud orders into local IndexedDB
 */
export async function pullCloudOrdersToLocal(): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;

  try {
    const { data, error } = await supabase.from('pos_orders').select('*');
    if (error || !data) return 0;

    let count = 0;
    for (const row of data) {
      if (row.data) {
        const orderObj: Order = {
          ...row.data,
          id: row.id,
          orderNo: row.order_no,
          status: row.status
        };
        await db.orders.put(orderObj);
        count++;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

/**
 * Full Bidirectional Sync
 */
export async function syncAllCloudData(): Promise<{ success: boolean; usersSynced: number; ordersSynced: number; message?: string }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { success: false, usersSynced: 0, ordersSynced: 0, message: 'Supabase is not configured' };
  }

  try {
    // 1. Sync users
    await pushLocalUsersToCloud();
    const usersPulled = await pullCloudUsersToLocal();

    // 2. Sync orders
    await pushLocalOrdersToCloud();
    const ordersPulled = await pullCloudOrdersToLocal();

    return {
      success: true,
      usersSynced: usersPulled,
      ordersSynced: ordersPulled
    };
  } catch (err: any) {
    return {
      success: false,
      usersSynced: 0,
      ordersSynced: 0,
      message: err.message || 'Sync failed'
    };
  }
}

