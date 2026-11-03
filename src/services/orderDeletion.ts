import { db } from '../db/db';
import { Order, UserRole } from '../types';

const assertOrderManager = (role: UserRole) => {
  if (role !== 'Admin' && role !== 'Staff') throw new Error('You do not have permission to manage archived orders.');
};

const eventFor = (order: Order, action: 'ARCHIVED' | 'RESTORED' | 'PERMANENTLY_DELETED', by: string) => ({
  action, at: new Date().toISOString(), by
});

const appendActionLog = async (entry: { orderId: string; orderNo: string; action: 'ARCHIVED' | 'RESTORED' | 'PERMANENTLY_DELETED'; at: string; by: string }) => {
  const setting = await db.settings.get('archive_action_log');
  const entries = setting ? JSON.parse(setting.value) as typeof entry[] : [];
  await db.settings.put({ key: 'archive_action_log', value: JSON.stringify([...entries, entry].slice(-500)) });
};

export type ArchiveSource = 'Order List' | 'Live Buying List';

export async function archiveOrder(orderId: string, role: UserRole, by: string, source: ArchiveSource = 'Order List'): Promise<string> {
  assertOrderManager(role);
  return db.transaction('rw', db.orders, db.settings, async () => {
    const order = await db.orders.get(orderId);
    if (!order) throw new Error('This order could not be found.');
    if (order.isArchived) throw new Error('This order is already in the Archive.');
    const history = order.archiveHistory || [];
    const event = eventFor(order, 'ARCHIVED', by);
    await db.orders.update(order.id, {
      isArchived: true,
      archivedAt: new Date().toISOString(),
      archivedBy: by,
      archivedFrom: source,
      archiveHistory: [...history, event],
      updatedAt: new Date().toISOString()
    });
    await appendActionLog({ orderId: order.id, orderNo: order.orderNo, ...event });
    return order.orderNo;
  });
}

export async function archiveOrders(orderIds: string[], role: UserRole, by: string, source: ArchiveSource = 'Order List'): Promise<number> {
  assertOrderManager(role);
  const uniqueIds = [...new Set(orderIds)];
  return db.transaction('rw', db.orders, db.settings, async () => {
    const found: Order[] = [];
    for (const id of uniqueIds) {
      const order = await db.orders.get(id);
      if (!order) throw new Error('One of the selected orders could not be found.');
      if (order.isArchived) throw new Error(`${order.orderNo} is already archived.`);
      found.push(order);
    }
    const now = new Date().toISOString();
    for (const order of found) {
      const event = eventFor(order, 'ARCHIVED', by);
      await db.orders.update(order.id, {
      isArchived: true, archivedAt: now, archivedBy: by, archivedFrom: source,
      archiveHistory: [...(order.archiveHistory || []), event], updatedAt: now
      });
      await appendActionLog({ orderId: order.id, orderNo: order.orderNo, ...event });
    }
    return found.length;
  });
}

export async function restoreArchivedOrder(orderId: string, role: UserRole, by: string): Promise<string> {
  assertOrderManager(role);
  return db.transaction('rw', db.orders, db.settings, async () => {
    const order = await db.orders.get(orderId);
    if (!order || !order.isArchived) throw new Error('This order is no longer in the Archive.');
    const conflict = (await db.orders.toArray()).find(candidate => candidate.id !== order.id && !candidate.isArchived && candidate.orderNo.trim().toLowerCase() === order.orderNo.trim().toLowerCase());
    if (conflict) throw new Error('This order already exists in the active records.');
    const event = eventFor(order, 'RESTORED', by);
    await db.orders.update(order.id, {
      isArchived: false, archivedAt: undefined, archivedBy: undefined,
      archiveHistory: [...(order.archiveHistory || []), event], updatedAt: new Date().toISOString()
    });
    await appendActionLog({ orderId: order.id, orderNo: order.orderNo, ...event });
    return order.orderNo;
  });
}

export async function restoreArchivedOrders(orderIds: string[], role: UserRole, by: string): Promise<number> {
  assertOrderManager(role);
  const uniqueIds = [...new Set(orderIds)];
  return db.transaction('rw', db.orders, db.settings, async () => {
    const found: Order[] = [];
    const selectedOrderNumbers = new Set<string>();
    const allOrders = await db.orders.toArray();
    for (const id of uniqueIds) {
      const order = await db.orders.get(id);
      if (!order || !order.isArchived) throw new Error('One of the selected orders is no longer in the Archive.');
      const conflict = allOrders.find(candidate => candidate.id !== order.id && !candidate.isArchived && candidate.orderNo.trim().toLowerCase() === order.orderNo.trim().toLowerCase());
      if (conflict) throw new Error(`${order.orderNo} already exists in the active records.`);
      const normalizedOrderNo = order.orderNo.trim().toLowerCase();
      if (selectedOrderNumbers.has(normalizedOrderNo)) throw new Error(`${order.orderNo} is duplicated in the selected archive records.`);
      selectedOrderNumbers.add(normalizedOrderNo);
      found.push(order);
    }
    const now = new Date().toISOString();
    for (const order of found) {
      const event = eventFor(order, 'RESTORED', by);
      await db.orders.update(order.id, {
      isArchived: false, archivedAt: undefined, archivedBy: undefined,
      archiveHistory: [...(order.archiveHistory || []), event], updatedAt: now
      });
      await appendActionLog({ orderId: order.id, orderNo: order.orderNo, ...event });
    }
    return found.length;
  });
}

export async function permanentlyDeleteArchivedOrders(orderIds: string[], role: UserRole, by: string): Promise<{ count: number; orderNumbers: string[] }> {
  if (role !== 'Admin') throw new Error('Only an Admin can permanently delete archived orders.');
  return db.transaction('rw', db.orders, db.orderItems, db.payments, db.stockMovements, db.settings, async () => {
    const uniqueIds = [...new Set(orderIds)];
    if (!uniqueIds.length) throw new Error('Select at least one archived order.');
    const targets: Array<{ order: Order; itemIds: string[] }> = [];
    for (const orderId of uniqueIds) {
      const order = await db.orders.get(orderId);
      if (!order || !order.isArchived) throw new Error('Only archived orders can be permanently deleted.');
      const [items, payments, movements] = await Promise.all([
        db.orderItems.where('orderId').equals(orderId).toArray(),
        db.payments.where('orderId').equals(orderId).toArray(),
        db.stockMovements.filter(movement => movement.orderId === orderId).toArray()
      ]);
      if (payments.length || movements.length || items.some(item => item.purchaseDate || (item.purchasedQty || 0) > 0 || ['PURCHASED', 'BOUGHT_FROM_STOCK'].includes(item.status))) {
        throw new Error(`${order.orderNo} has financial or stock history and must remain archived to protect those records. No selected orders were deleted.`);
      }
      targets.push({ order, itemIds: items.map(item => item.id) });
    }
    for (const { order, itemIds } of targets) {
      await db.orderItems.bulkDelete(itemIds);
      await db.orders.delete(order.id);
      await appendActionLog({ orderId: order.id, orderNo: order.orderNo, ...eventFor(order, 'PERMANENTLY_DELETED', by) });
    }
    const hiddenSetting = await db.settings.get('masterlist_hidden_order_refs');
    const hiddenRefs = hiddenSetting ? JSON.parse(hiddenSetting.value) as string[] : [];
    const hiddenRefSet = new Set(hiddenRefs.map(reference => reference.trim().toLowerCase()));
    targets.forEach(({ order }) => hiddenRefSet.add(order.orderNo.trim().toLowerCase()));
    await db.settings.put({ key: 'masterlist_hidden_order_refs', value: JSON.stringify([...hiddenRefSet]) });
    return { count: targets.length, orderNumbers: targets.map(({ order }) => order.orderNo) };
  });
}

