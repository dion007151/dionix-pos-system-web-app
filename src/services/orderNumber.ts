import { db } from '../db/db';

const localDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Generate the next daily human-readable order reference inside an existing orders/settings transaction. */
export async function nextDailyOrderNumber(date: Date): Promise<string> {
  const dateKey = localDateKey(date);
  const month = date.toLocaleString('en-US', { month: 'short' });
  const prefix = `${month}${String(date.getDate()).padStart(2, '0')}-`;
  const counterKey = `order_sequence_${dateKey}`;
  const [savedCounter, orders, auditSetting] = await Promise.all([
    db.settings.get(counterKey),
    db.orders.toArray(),
    db.settings.get('archive_action_log')
  ]);
  let auditedOrderNumbers: string[] = [];
  try {
    const events = auditSetting ? JSON.parse(auditSetting.value) as Array<{ orderNo?: string }> : [];
    auditedOrderNumbers = events.map(event => event.orderNo || '');
  } catch {
    // The persisted counter and order table still protect numbering if an older audit value is malformed.
  }
  const highestExisting = [...orders.map(order => order.orderNo), ...auditedOrderNumbers].reduce((highest, orderNo) => {
    if (!orderNo.startsWith(prefix)) return highest;
    const sequence = Number(orderNo.slice(prefix.length));
    return Number.isSafeInteger(sequence) ? Math.max(highest, sequence) : highest;
  }, 0);
  const previousCounter = Number(savedCounter?.value || 0);
  const next = Math.max(Number.isSafeInteger(previousCounter) ? previousCounter : 0, highestExisting) + 1;
  await db.settings.put({ key: counterKey, value: String(next) });
  return `${prefix}${String(next).padStart(3, '0')}`;
}
