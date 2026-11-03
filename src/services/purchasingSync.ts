import { db } from '../db/db';
import { AvailabilityHistoryEntry, OrderItem, Product } from '../types';

export type PurchasingSyncStatus = 'UNAVAILABLE' | 'REORDER' | 'AVAILABLE_AGAIN' | 'CANCELLED';

const normalize = (value?: string) => value?.trim().toLocaleLowerCase() || '';

function productForItem(item: OrderItem, products: Product[]): Product | undefined {
  if (item.productId) return products.find(product => product.id === item.productId);
  if (item.barcode) return products.find(product => normalize(product.barcode) === normalize(item.barcode));
  const matches = products.filter(product => normalize(product.name) === normalize(item.productName));
  return matches.length === 1 ? matches[0] : undefined;
}

function sameProduct(item: OrderItem, product: Product, products: Product[]): boolean {
  if (item.productId) return item.productId === product.id;
  if (item.barcode) return !!product.barcode && normalize(item.barcode) === normalize(product.barcode);
  return productForItem(item, products)?.id === product.id;
}

export async function syncPurchasingStatus(
  source: OrderItem,
  nextStatus: PurchasingSyncStatus,
  actor: string,
  reason?: string
): Promise<{ affectedOrders: number; affectedItems: number }> {
  const [products, orders, orderItems] = await Promise.all([
    db.products.toArray(), db.orders.toArray(), db.orderItems.toArray()
  ]);
  const product = productForItem(source, products);
  if (!product) return { affectedOrders: 0, affectedItems: 0 };

  const activeOrders = new Map(orders.filter(order => order.status !== 'COMPLETED' && order.status !== 'CANCELLED').map(order => [order.id, order]));
  const matches = orderItems.filter(item => activeOrders.has(item.orderId) && sameProduct(item, product, products));
  const orderNumbers = [...new Set(matches.map(item => activeOrders.get(item.orderId)!.orderNo))];
  const now = new Date().toISOString();
  let affectedItems = 0;

  await db.transaction('rw', db.orderItems, async () => {
    for (const item of matches) {
      const current = await db.orderItems.get(item.id);
      if (!current) continue;
      const history = current.availabilityHistory || [];
      const action = nextStatus === 'UNAVAILABLE' ? 'Marked unavailable' :
        nextStatus === 'REORDER' ? 'Re-ordered' :
        nextStatus === 'AVAILABLE_AGAIN' ? 'Restocked / available' : 'Buying item cancelled';
      const lastEntry = history[history.length - 1];
      if (nextStatus === 'UNAVAILABLE' && current.status === 'UNAVAILABLE' && current.unavailableReason === (reason || 'Supplier reported out of stock')) continue;
      if (nextStatus === 'REORDER' && current.status === 'REORDER') continue;
      const duplicate = lastEntry?.action === action &&
        (nextStatus !== 'UNAVAILABLE' || lastEntry?.reason === reason);
      if (duplicate) continue;
      if (nextStatus === 'AVAILABLE_AGAIN' && !['UNAVAILABLE', 'BACKORDER', 'PENDING'].includes(current.status)) continue;

      const entry: AvailabilityHistoryEntry = {
        action, at: now, by: actor, reason,
        previousStatus: current.status,
        nextStatus: nextStatus === 'CANCELLED' ? current.status : nextStatus,
        affectedOrderNumbers: orderNumbers,
        requiresStaffAction: nextStatus === 'CANCELLED'
      };
      const patch: Partial<OrderItem> = {
        productId: current.productId || product.id,
        barcode: current.barcode || product.barcode,
        availabilityHistory: [...history, entry]
      };
      if (nextStatus !== 'CANCELLED') patch.status = nextStatus;
      if (nextStatus === 'UNAVAILABLE') {
        patch.unavailableReason = reason || 'Supplier reported out of stock';
        patch.unavailableAt = now;
        patch.unavailableBy = actor;
      }
      await db.orderItems.update(current.id, patch);
      affectedItems += 1;
    }
  });
  return { affectedOrders: new Set(matches.map(item => item.orderId)).size, affectedItems };
}

export async function recordOrderItemAction(
  item: OrderItem,
  actor: string,
  action: string,
  details: Omit<AvailabilityHistoryEntry, 'action' | 'at' | 'by'> = {},
  updates: Partial<OrderItem> = {}
): Promise<void> {
  const current = await db.orderItems.get(item.id);
  if (!current) return;
  const entry: AvailabilityHistoryEntry = { action, at: new Date().toISOString(), by: actor, previousStatus: current.status, ...details };
  await db.orderItems.update(current.id, {
    ...updates,
    availabilityHistory: [...(current.availabilityHistory || []), entry]
  });
}


