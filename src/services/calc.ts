import {
  OrderItem,
  PasabuyRateTier,
  Payment,
  PaymentStatus,
  OrderStatus,
  Order
} from '../types';

export const DEFAULT_RATE_TIERS: PasabuyRateTier[] = [
  { minAmount: 1, maxAmount: 99, fixedFee: 50 },
  { minAmount: 100, maxAmount: 199, fixedFee: 75 },
  { minAmount: 200, maxAmount: 299, fixedFee: 100 },
  { minAmount: 300, maxAmount: 999, fixedFee: 150 },
  { minAmount: 1000, maxAmount: 1499, fixedFee: 250 },
  { minAmount: 1500, maxAmount: 1999, fixedFee: 300 },
  { minAmount: 2000, maxAmount: 2499, fixedFee: 350 },
  { minAmount: 2500, maxAmount: null, percentageFee: 0.15 }
];

/**
 * 2-Decimal safe money rounding (equivalent to MidpointRounding.AwayFromZero)
 */
export function roundMoney(amount: number): number {
  if (isNaN(amount) || !isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * Computes item amount = qty * unit price
 */
export function itemAmount(qty: number, price: number): number {
  if (qty <= 0 || price <= 0) return 0;
  return roundMoney(qty * price);
}

/**
 * Resolves item unit price: actual price if resolved, else estimated price
 */
export function resolveItemUnitPrice(item?: Partial<OrderItem>): number {
  if (!item) return 0;
  if (item.actualPrice !== undefined && item.actualPrice !== null && item.actualPrice > 0) {
    return item.actualPrice;
  }
  return item.estimatedPrice || 0;
}

/**
 * Determines if item is counted in totals
 */
export function isCountedItem(item?: Partial<OrderItem>): boolean {
  if (!item || !item.productName || item.productName.trim() === '-' || item.productName.trim() === '') {
    return false;
  }
  switch (item.status) {
    case 'PENDING':
    case 'PURCHASED':
    case 'BOUGHT_FROM_STOCK':
      return true;
    case 'UNAVAILABLE':
    case 'REORDER':
    case 'CANCELLED':
      return false;
    default:
      return true;
  }
}

/**
 * Computes items subtotal from counted items
 */
export function orderSubtotal(items?: OrderItem[]): number {
  if (!items || items.length === 0) return 0;
  let sum = 0;
  for (const item of items) {
    if (isCountedItem(item)) {
      const price = resolveItemUnitPrice(item);
      sum += itemAmount(item.qty, price);
    }
  }
  return roundMoney(sum);
}

/**
 * Computes subtotal for items eligible for tiered Pasabuy Fee
 */
export function feeSubtotal(items?: OrderItem[]): number {
  if (!items || items.length === 0) return 0;
  let sum = 0;
  for (const item of items) {
    if (!isCountedItem(item)) continue;
    const feeType = item.feeType || 'STANDARD';
    if (feeType === 'STANDARD' && !item.isFeeExempt) {
      const price = resolveItemUnitPrice(item);
      sum += itemAmount(item.qty, price);
    }
  }
  return roundMoney(sum);
}

/**
 * Computes manual fee total for MANUAL items
 */
export function manualFeeTotal(items?: OrderItem[]): number {
  if (!items || items.length === 0) return 0;
  let sum = 0;
  for (const item of items) {
    if (!isCountedItem(item)) continue;
    if (item.feeType === 'MANUAL' && item.manualFeeAmount && item.manualFeeAmount > 0) {
      sum += roundMoney(item.manualFeeAmount * item.qty);
    }
  }
  return roundMoney(sum);
}

/**
 * Computes tiered Pasabuy Fee using Excel approximate lower-bound match
 */
export function calculateTierFee(subtotal: number, tiers: PasabuyRateTier[] = DEFAULT_RATE_TIERS): number {
  if (subtotal <= 0) return 0;
  if (subtotal >= 2500) {
    return roundMoney(subtotal * 0.15);
  }

  const sorted = [...tiers].sort((a, b) => a.minAmount - b.minAmount);
  let matched: PasabuyRateTier | null = null;

  for (const tier of sorted) {
    if (subtotal >= tier.minAmount) {
      matched = tier;
    } else {
      break;
    }
  }

  if (!matched && subtotal > 0) {
    matched = sorted.find(t => t.minAmount <= 1) || sorted[0];
  }

  if (matched) {
    if (matched.fixedFee !== undefined && matched.fixedFee !== null) {
      return roundMoney(matched.fixedFee);
    }
    if (matched.percentageFee !== undefined && matched.percentageFee !== null) {
      return roundMoney(subtotal * matched.percentageFee);
    }
  }

  if (subtotal >= 2000) return 350;
  if (subtotal >= 1500) return 300;
  if (subtotal >= 1000) return 250;
  if (subtotal >= 300) return 150;
  if (subtotal >= 200) return 100;
  if (subtotal >= 100) return 75;
  return 50;
}

/**
 * Computes full Pasabuy Fee including tier fee and manual item fees
 */
export function computePasabuyFee(
  items?: OrderItem[],
  tiers: PasabuyRateTier[] = DEFAULT_RATE_TIERS,
  manualOverride?: number | null,
  overrideNote?: string | null
): { fee: number; isAdjusted: boolean } {
  if (manualOverride !== undefined && manualOverride !== null && manualOverride >= 0) {
    return { fee: roundMoney(manualOverride), isAdjusted: true };
  }

  const baseFee = calculateTierFee(feeSubtotal(items), tiers);
  const addlFee = manualFeeTotal(items);
  return { fee: roundMoney(baseFee + addlFee), isAdjusted: false };
}

/**
 * Computes Grand Total = Subtotal + Service Fee + Delivery Fee - Discount
 */
export function computeGrandTotal(
  itemsSubtotal: number,
  serviceFee: number,
  deliveryFee: number = 0,
  discount: number = 0
): number {
  const total = itemsSubtotal + serviceFee + deliveryFee - discount;
  return roundMoney(Math.max(0, total));
}

/**
 * Computes total paid from payments array
 */
export function computeTotalPaid(payments?: Payment[]): number {
  if (!payments || payments.length === 0) return 0;
  return roundMoney(payments.reduce((sum, p) => sum + (p.amount || 0), 0));
}

/**
 * Computes balance due = grandTotal - totalPaid
 */
export function computeBalanceDue(grandTotal: number, totalPaid: number): number {
  return roundMoney(Math.max(0, grandTotal - totalPaid));
}

/**
 * Determines Payment Status
 */
export function getPaymentStatus(grandTotal: number, totalPaid: number): PaymentStatus {
  if (grandTotal <= 0) return 'PAID';
  if (totalPaid <= 0) return 'UNPAID';
  if (totalPaid < grandTotal) return 'PARTIAL';
  return 'PAID';
}

/**
 * Derives Order Status from items
 */
export function deriveOrderStatus(
  isCancelled: boolean,
  isCompleted: boolean,
  items?: OrderItem[]
): OrderStatus {
  if (isCancelled) return 'CANCELLED';
  if (isCompleted) return 'COMPLETED';

  if (items && items.some(i => i.status === 'PENDING' && i.productName && i.productName.trim() !== '-')) {
    return 'WAITING_CONFIRMATION';
  }

  return 'BOUGHT';
}

/**
 * Full calculation summary for an Order
 */
export function calculateOrderSummary(order: Partial<Order>, tiers: PasabuyRateTier[] = DEFAULT_RATE_TIERS) {
  const subtotal = orderSubtotal(order.items);
  const { fee: calculatedFee, isAdjusted } = computePasabuyFee(
    order.items,
    tiers,
    order.manualFeeOverride,
    order.feeOverrideNote
  );
  const fee = order.serviceFee !== undefined && order.serviceFee !== null ? order.serviceFee : calculatedFee;
  const delivery = order.deliveryFee || 0;
  const discount = order.discount || 0;
  const grandTotal = computeGrandTotal(subtotal, fee, delivery, discount);
  const paid = computeTotalPaid(order.payments);
  const balance = computeBalanceDue(grandTotal, paid);
  const paymentStatus = getPaymentStatus(grandTotal, paid);

  return {
    subtotal,
    fee,
    isAdjusted,
    delivery,
    discount,
    grandTotal,
    paid,
    balance,
    paymentStatus
  };
}
