import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Archive, ArrowDown, ArrowUp, CalendarDays, Check, ChevronLeft, ChevronRight, CircleDollarSign,
  ClipboardList, CreditCard, Database, Eye, FileText, Filter, Package, Printer,
  Receipt, RotateCcw, Search, Warehouse, X
} from 'lucide-react';
import { db } from '../../db/db';
import { useApp, ActiveView } from '../../context/AppContext';
import { calculateOrderSummary, roundMoney } from '../../services/calc';
import { SHOPPER_LOGO_DATA_URL } from '../../assets/shopperLogo';

type MasterlistSection = 'all' | 'orders' | 'payments' | 'expenses' | 'inventory';
type RecordKind = Exclude<MasterlistSection, 'all'>;
type MasterlistItem = { name: string; store: string | null; unitPrice: number | null; quantity: number | null; lineAmount: number | null; status: string; sourceStatus?: string };
type LegacyOrder = { id: string; kind: 'orders'; reference: string; customer: string; status: string; sourceStatus?: string; sourceRow: number; date: null; orderTotal: number | null; groceriesTotal: number | null; pasabuyFee: number | null; items: MasterlistItem[] };
type MasterlistRecord = {
  id: string;
  kind: RecordKind;
  date: string | null;
  reference: string;
  description: string;
  status: string;
  amount: number | null;
  amountLabel?: string;
  relatedOrder?: string;
  relatedOrderId?: string;
  paymentMethod?: string;
  source?: string;
  groceriesTotal?: number | null;
  pasabuyFee?: number | null;
  items?: MasterlistItem[];
  details?: Record<string, string | number | null | undefined>;
};
type ArchivePayload = { source: string; sheet: string; dateNote: string; records: LegacyOrder[] };
type DatePreset = 'all' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

const SECTION_INFO: Record<MasterlistSection, { title: string; description: string }> = {
  all: { title: 'All Records', description: 'View and search historical business records in one place.' },
  orders: { title: 'Orders Masterlist', description: 'Review current and historical customer orders.' },
  payments: { title: 'Payments Masterlist', description: 'Review payment transactions and payment history.' },
  expenses: { title: 'Expenses Masterlist', description: 'Review recorded business expenses.' },
  inventory: { title: 'Inventory History', description: 'Review stock additions, deductions, and adjustments.' }
};

const money = (amount: number) => '₱' + roundMoney(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const localDateKey = (value: string | null) => value ? dateKey(new Date(value)) : '';
const makeDailyReferenceMap = (entries: Array<{ id: string; date: string }>, prefix: string) => {
  const result = new Map<string, string>();
  const counts = new Map<string, number>();
  [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)).forEach(entry => {
    const parsedDate = new Date(entry.date);
    const datePart = Number.isNaN(parsedDate.getTime()) ? 'UNDATED' : dateKey(parsedDate).replace(/-/g, '');
    const sequence = (counts.get(datePart) || 0) + 1;
    counts.set(datePart, sequence);
    result.set(entry.id, `${prefix}-${datePart}-${String(sequence).padStart(3, '0')}`);
  });
  return result;
};
const recordKindLabel = (kind: RecordKind) => kind === 'orders' ? 'Order' : kind === 'payments' ? 'Payment' : kind === 'expenses' ? 'Expense' : 'Inventory';
const recordKindIcon = (kind: RecordKind) => kind === 'orders' ? Package : kind === 'payments' ? CreditCard : kind === 'expenses' ? Receipt : Warehouse;
const formatStatusLabel = (status: string) => status.replace(/_/g, ' ').replace(/\bUNAVAILABLE\b/gi, 'NOT AVAILABLE');
const statusClass = (status: string) => {
  const normalized = status.toLowerCase();
  if (/(cancel|failed|not available|unavailable)/.test(normalized)) return 'border-rose-200 bg-rose-50 text-rose-700';
  if (/(pending|reorder|backorder|waiting|attention)/.test(normalized)) return 'border-amber-200 bg-amber-50 text-amber-800';
  if (/(complete|paid|recorded|bought|available)/.test(normalized)) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (/(ready|buying)/.test(normalized)) return 'border-pink-200 bg-pink-50 text-pink-800';
  return 'border-slate-200 bg-slate-50 text-slate-600';
};
const buyingListRowClass = (status: string) => {
  const normalized = status.toUpperCase().replace(/[-_\s]/g, '');
  if (normalized.includes('REORDER')) return 'bg-yellow-100 hover:bg-yellow-200/80';
  if (normalized.includes('NOTAVAILABLE') || normalized.includes('UNAVAILABLE')) return 'bg-red-200 hover:bg-red-300/80';
  if (normalized.includes('CANCEL')) return 'bg-slate-100 text-slate-600 hover:bg-slate-200';
  return 'bg-white hover:bg-pink-50/50';
};
const buyingListBadgeClass = (status: string) => {
  const normalized = status.toUpperCase().replace(/[-_\s]/g, '');
  if (normalized.includes('REORDER')) return 'bg-yellow-300 text-yellow-950';
  if (normalized.includes('NOTAVAILABLE') || normalized.includes('UNAVAILABLE')) return 'bg-red-600 text-white';
  if (normalized.includes('CANCEL')) return 'bg-slate-200 text-slate-700';
  return statusClass(status);
};
const buyingPrintStatusClass = (status: string) => {
  const normalized = status.toUpperCase().replace(/[-_\s]/g, '');
  if (normalized.includes('REORDER')) return 'status-reorder';
  if (normalized.includes('NOTAVAILABLE') || normalized.includes('UNAVAILABLE')) return 'status-unavailable';
  if (normalized.includes('CANCEL')) return 'status-cancelled';
  if (normalized.includes('BACKORDER')) return 'status-backorder';
  if (normalized.includes('ALTERNATIVESELECTED')) return 'status-alternative-selected';
  return '';
};
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character);

export const MasterlistView: React.FC<{ section: MasterlistSection }> = ({ section }) => {
  const { setActiveView, addToast, currentUser, businessInfo } = useApp();
  const [search, setSearch] = useState('');
  const [recordType, setRecordType] = useState<RecordKind | 'all'>(() => section === 'all' ? 'orders' : 'all');
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');
  const [preset, setPreset] = useState<DatePreset>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [appliedRange, setAppliedRange] = useState<{ from: string; to: string } | null>(null);
  const [page, setPage] = useState(1);
  const [selectedRecord, setSelectedRecord] = useState<MasterlistRecord | null>(null);
  const [legacyOrders, setLegacyOrders] = useState<LegacyOrder[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(true);
  const [archiveError, setArchiveError] = useState(false);

  const orders = useLiveQuery(() => db.orders.orderBy('createdAt').reverse().toArray(), []);
  const orderItems = useLiveQuery(() => db.orderItems.toArray(), []);
  const payments = useLiveQuery(() => db.payments.orderBy('paymentDate').reverse().toArray(), []);
  const expenses = useLiveQuery(() => db.expenses.orderBy('expenseDate').reverse().toArray(), []);
  const stockMovements = useLiveQuery(() => db.stockMovements.orderBy('timestamp').reverse().toArray(), []);
  const hiddenArchiveRefsSetting = useLiveQuery(() => db.settings.get('masterlist_hidden_order_refs'), []);
  const products = useLiveQuery(() => db.products.toArray(), []);
  const customers = useLiveQuery(() => db.customers.toArray(), []);
  const rateTiers = useLiveQuery(() => db.rateTiers.toArray(), []);

  useEffect(() => {
    let active = true;
    fetch(`${import.meta.env.BASE_URL}masterlistArchive.json`)
      .then(response => {
        if (!response.ok) throw new Error('Historical archive is not available.');
        return response.json() as Promise<ArchivePayload>;
      })
      .then(payload => { if (active) setLegacyOrders(payload.records || []); })
      .catch(() => { if (active) setArchiveError(true); })
      .finally(() => { if (active) setArchiveLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setRecordType(section === 'all' ? 'orders' : 'all');
  }, [section]);

  useEffect(() => {
    if (!selectedRecord) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedRecord(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selectedRecord]);

  const records = useMemo(() => {
    if (!orders || !orderItems || !payments || !expenses || !stockMovements) return [] as MasterlistRecord[];
    const rows: MasterlistRecord[] = [];
    const orderById = new Map(orders.map(order => [order.id, order]));
    const itemsByOrder = new Map<string, typeof orderItems>();
    orderItems.forEach(item => itemsByOrder.set(item.orderId, [...(itemsByOrder.get(item.orderId) || []), item]));
    const customerById = new Map((customers || []).map(customer => [customer.id, customer]));
    const expenseReferenceById = makeDailyReferenceMap(expenses.map(expense => ({ id: expense.id, date: expense.expenseDate })), 'EXP');
    const movementReferenceById = makeDailyReferenceMap(stockMovements.map(movement => ({ id: movement.id, date: movement.timestamp })), 'INV');
    const paymentReferenceById = new Map<string, string>();
    const paymentSequenceByDate = new Map<string, number>();
    [...payments].sort((a, b) => a.paymentDate.localeCompare(b.paymentDate) || a.id.localeCompare(b.id)).forEach(payment => {
      const parsedDate = new Date(payment.paymentDate);
      const datePart = Number.isNaN(parsedDate.getTime()) ? 'UNDATED' : dateKey(parsedDate).replace(/-/g, '');
      const sequence = (paymentSequenceByDate.get(datePart) || 0) + 1;
      paymentSequenceByDate.set(datePart, sequence);
      paymentReferenceById.set(payment.id, `PAY-${datePart}-${String(sequence).padStart(3, '0')}`);
    });
    const existingOrderRefs = new Set(orders.map(order => order.orderNo.trim().toLowerCase()));
    const hiddenArchiveRefs = new Set((hiddenArchiveRefsSetting ? JSON.parse(hiddenArchiveRefsSetting.value) as string[] : []).map(reference => reference.trim().toLowerCase()));

    if (section === 'all' || section === 'orders') {
      orders.forEach(order => {
        if (order.isArchived) return;
        const items = itemsByOrder.get(order.id) || [];
        const orderPayments = payments.filter(payment => payment.orderId === order.id);
        const summary = calculateOrderSummary({ ...order, items, payments: orderPayments }, rateTiers);
        rows.push({
          id: 'order:' + order.id, kind: 'orders', date: order.createdAt, reference: order.orderNo,
          description: order.customerName || customerById.get(order.customerId)?.name || 'Walk-in Customer',
          status: order.status.replace(/_/g, ' '), amount: summary.grandTotal, relatedOrder: order.orderNo,
          relatedOrderId: order.id,
          groceriesTotal: summary.subtotal, pasabuyFee: summary.fee,
          items: items.map(item => ({ name: item.productName, store: item.storeName || null, quantity: item.qty, unitPrice: item.actualPrice ?? item.estimatedPrice, lineAmount: roundMoney(item.qty * (item.actualPrice ?? item.estimatedPrice)), status: order.status === 'CANCELLED' ? 'CANCELLED' : item.status.replace(/_/g, ' ') })),
          details: { Customer: order.customerName || customerById.get(order.customerId)?.name || 'Walk-in Customer', Phone: order.customerPhone || customerById.get(order.customerId)?.phone, Address: order.address, 'Delivery type': order.deliveryType, 'Delivery fee': order.deliveryFee, 'Service fee': order.serviceFee, Discount: order.discount }
        });
      });
      legacyOrders.forEach(order => {
        if (hiddenArchiveRefs.has(order.reference.trim().toLowerCase())) return;
        if (existingOrderRefs.has(order.reference.trim().toLowerCase())) return;
        rows.push({
          id: order.id, kind: 'orders', date: null, reference: order.reference,
          description: order.customer || 'Customer not recorded', status: order.status || 'Unspecified',
          amount: order.orderTotal, relatedOrder: order.reference, source: 'Historical workbook · E tab', items: order.items,
          groceriesTotal: order.groceriesTotal, pasabuyFee: order.pasabuyFee,
          details: { Customer: order.customer, 'Source sheet': 'E', 'Source row': order.sourceRow, 'Source status': order.sourceStatus, 'Original date': 'Not recorded in source', 'Payment transactions': 'Not included in source' }
        });
      });
    }

    if (section === 'all' || section === 'payments') {
      payments.forEach(payment => {
        const order = orderById.get(payment.orderId);
        const paymentReference = payment.referenceNo?.trim() || paymentReferenceById.get(payment.id) || payment.id;
        const customerName = order
          ? order.customerName || customerById.get(order.customerId)?.name || 'Walk-in Customer'
          : 'Customer record unavailable';
        rows.push({
          id: 'payment:' + payment.id, kind: 'payments', date: payment.paymentDate,
          reference: paymentReference, description: customerName,
          status: 'RECORDED', amount: payment.amount, relatedOrder: order?.orderNo || payment.orderId, relatedOrderId: order?.id || payment.orderId,
          paymentMethod: payment.method, details: { Customer: customerName, 'Customer phone': order?.customerPhone || customerById.get(order?.customerId || '')?.phone, 'Order number': order?.orderNo || payment.orderId, 'Payment reference': paymentReference, 'Original reference': payment.referenceNo, 'Received by': payment.receivedBy, Notes: payment.notes }
        });
      });
    }

    if (section === 'all' || section === 'expenses') {
      expenses.forEach(expense => rows.push({
        id: 'expense:' + expense.id, kind: 'expenses', date: expense.expenseDate, reference: expenseReferenceById.get(expense.id) || expense.id,
        description: expense.description, status: 'RECORDED', amount: expense.amount,
        details: { Category: expense.category, Notes: expense.notes, 'Created by': expense.createdBy, 'Expense record ID': expense.id }
      }));
    }

    if (section === 'all' || section === 'inventory') {
      const productById = new Map((products || []).map(product => [product.id, product]));
      stockMovements.forEach(movement => {
        const product = productById.get(movement.productId);
        const delta = movement.changeQty > 0 ? '+' + movement.changeQty : String(movement.changeQty);
        rows.push({
          id: 'stock:' + movement.id, kind: 'inventory', date: movement.timestamp,
          reference: movementReferenceById.get(movement.id) || movement.id, description: movement.productName,
          status: `Stock ${movement.newQuantity}${product?.unit ? ' ' + product.unit : ''}`,
          amount: movement.changeQty, amountLabel: `${delta}${product?.unit ? ' ' + product.unit : ' units'}`,
          relatedOrder: movement.orderId ? orderById.get(movement.orderId)?.orderNo || movement.orderId : undefined,
          relatedOrderId: movement.orderId, details: { Note: movement.note, 'New stock quantity': movement.newQuantity, Product: movement.productName, 'Product SKU': product?.barcode || movement.productId, 'Stock movement ID': movement.id }
        });
      });
    }
    return rows;
  }, [section, orders, orderItems, payments, expenses, stockMovements, products, customers, rateTiers, legacyOrders, hiddenArchiveRefsSetting]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return records.filter(record => {
      if (recordType !== 'all' && record.kind !== recordType) return false;
      if (appliedRange) {
        const key = localDateKey(record.date);
        if (!key || (appliedRange.from && key < appliedRange.from) || (appliedRange.to && key > appliedRange.to)) return false;
      }
      if (!query) return true;
      const itemText = record.items?.map(item => item.name).join(' ') || '';
      return [record.reference, record.description, record.status, record.kind, record.paymentMethod || '', itemText]
        .some(value => value.toLocaleLowerCase().includes(query));
    }).sort((a, b) => {
      const aDate = a.date ? new Date(a.date).getTime() : Number.NEGATIVE_INFINITY;
      const bDate = b.date ? new Date(b.date).getTime() : Number.NEGATIVE_INFINITY;
      return sortDirection === 'desc' ? bDate - aDate : aDate - bDate;
    });
  }, [records, search, recordType, appliedRange, sortDirection]);

  useEffect(() => setPage(1), [search, recordType, appliedRange, sortDirection, section]);
  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pagedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);
  const summary = {
    total: filteredRows.length,
    orders: filteredRows.filter(row => row.kind === 'orders').length,
    payments: filteredRows.filter(row => row.kind === 'payments').reduce((sum, row) => sum + (row.amount || 0), 0),
    expenses: filteredRows.filter(row => row.kind === 'expenses').reduce((sum, row) => sum + (row.amount || 0), 0)
  };
  const title = SECTION_INFO[section];
  const displayedRecordType = section === 'all' ? recordType : section;
  const descriptionColumnTitle = displayedRecordType === 'payments' ? 'Customer / Order' : displayedRecordType === 'expenses' ? 'Expense Description' : displayedRecordType === 'inventory' ? 'Product / Order' : displayedRecordType === 'orders' ? 'Customer' : 'Customer / Description';
  const showRelatedOrderColumn = displayedRecordType === 'all';
  const showPaymentMethodColumn = displayedRecordType === 'all' || displayedRecordType === 'payments';
  const rangeLabel = appliedRange
    ? `${appliedRange.from || 'Any date'} — ${appliedRange.to || 'Any date'}`
    : 'All dates';

  const setQuickRange = (value: Exclude<DatePreset, 'custom'>) => {
    setPreset(value);
    if (value === 'all') { setAppliedRange(null); setFromDate(''); setToDate(''); return; }
    const end = new Date();
    const start = new Date(end);
    if (value === 'daily') start.setHours(0, 0, 0, 0);
    if (value === 'weekly') { start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); start.setHours(0, 0, 0, 0); }
    if (value === 'monthly') start.setDate(1), start.setHours(0, 0, 0, 0);
    if (value === 'yearly') start.setMonth(0, 1), start.setHours(0, 0, 0, 0);
    setFromDate(dateKey(start)); setToDate(dateKey(end));
    setAppliedRange({ from: dateKey(start), to: dateKey(end) });
  };

  const applyCustomRange = () => {
    if (!fromDate || !toDate) {
      addToast('Choose both a From Date and To Date.', 'error');
      return;
    }
    if (fromDate && toDate && fromDate > toDate) {
      addToast('From Date must be on or before To Date.', 'error');
      return;
    }
    setPreset('custom');
    setAppliedRange({ from: fromDate, to: toDate });
  };

  const resetFilters = () => {
    setSearch(''); setRecordType(section === 'all' ? 'orders' : 'all'); setSortDirection('desc'); setPreset('all');
    setFromDate(''); setToDate(''); setAppliedRange(null); setPage(1);
  };

  const printMasterlist = () => {
    if (!filteredRows.length) {
      addToast('There are no records to print for the selected filters.', 'error');
      return;
    }

    // Inject dedicated @page rule to eliminate blank page 1 and force landscape
    const styleId = '__masterlist_print_page_style__';
    let styleTag = document.getElementById(styleId);
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = styleId;
      document.head.appendChild(styleTag);
    }
    styleTag.innerHTML = '@page { size: A4 landscape; margin: 6mm; }';

    document.body.classList.add('printing-masterlist');
    window.print();

    setTimeout(() => {
      document.body.classList.remove('printing-masterlist');
      if (styleTag && styleTag.parentNode) {
        styleTag.parentNode.removeChild(styleTag);
      }
    }, 1500);
  };

  const printRecord = (record: MasterlistRecord) => {
    const popup = window.open('', '_blank', 'width=850,height=700');
    if (!popup) { addToast('Allow pop-ups to print this record.', 'error'); return; }
    const itemRows = record.items?.map(item => `<tr><td>${escapeHtml(formatStatusLabel(item.status))}</td><td>${escapeHtml(item.store || '')}</td><td>${escapeHtml(item.name)}</td><td>${item.unitPrice === null ? '' : money(item.unitPrice)}</td><td>${item.quantity ?? ''}</td><td>${item.lineAmount === null ? '' : money(item.lineAmount)}</td></tr>`).join('') || '';
    const detailRows = Object.entries(record.details || {}).filter(([, value]) => value !== null && value !== undefined && value !== '').map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(formatStatusLabel(String(value)))}</td></tr>`).join('');
    popup.document.write(`<!doctype html><html><head><title>${escapeHtml(record.reference)}</title><meta name="viewport" content="width=device-width"><style>body{font:14px Arial,sans-serif;color:#202235;margin:28px}h1{font-size:20px;color:#451323}table{width:100%;border-collapse:collapse;margin-top:18px}td,th{padding:8px;border:1px solid #e5e7eb;text-align:left}small{color:#737b91}</style></head><body><h1>DIONIX POS · ${escapeHtml(recordKindLabel(record.kind))}</h1><small>${escapeHtml(record.reference)} · ${record.date ? escapeHtml(new Date(record.date).toLocaleString('en-PH')) : 'Date not recorded'}</small><table><tbody><tr><th>Description</th><td>${escapeHtml(record.description)}</td></tr><tr><th>Status</th><td>${escapeHtml(formatStatusLabel(record.status))}</td></tr><tr><th>Amount</th><td>${record.amount === null ? 'Not recorded' : escapeHtml(record.amountLabel || money(record.amount))}</td></tr>${detailRows}</tbody></table>${itemRows ? `<h2>Items</h2><table><thead><tr><th>Bought / Stock</th><th>Store</th><th>Items</th><th>Price</th><th>Qty</th><th>S&amp;R/SM</th></tr></thead><tbody>${itemRows}</tbody><tfoot><tr><th colspan="4">Total Groceries</th><td colspan="2">${record.groceriesTotal == null ? '—' : money(record.groceriesTotal)}</td></tr><tr><th colspan="4">Pasabuy Fee</th><td colspan="2">${record.pasabuyFee == null ? '—' : money(record.pasabuyFee)}</td></tr><tr><th colspan="4">Total Bill</th><td colspan="2">${record.amount == null ? '—' : money(record.amount)}</td></tr></tfoot></table>` : ''}<script>window.onload=()=>window.print()</script></body></html>`);
    popup.document.close();
  };

  const renderActionButtons = (record: MasterlistRecord) => <div className="flex items-center justify-end gap-1.5">
    <button onClick={() => setSelectedRecord(record)} aria-label={`View ${record.reference}`} title="View details" className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:border-pink-200 hover:bg-pink-50 hover:text-pink-800"><Eye className="h-3.5 w-3.5" /></button>
    <button onClick={() => printRecord(record)} aria-label={`Print ${record.reference}`} title="Print" className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:border-pink-200 hover:bg-pink-50 hover:text-pink-800"><Printer className="h-3.5 w-3.5" /></button>
    {record.relatedOrderId && <button onClick={() => setActiveView('orders' as ActiveView)} title="Open Orders" className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:border-pink-200 hover:bg-pink-50 hover:text-pink-800"><FileText className="h-3.5 w-3.5" /></button>}
  </div>;

  const renderRecordDetails = (record: MasterlistRecord) => <>
    {record.details && <div className="grid gap-2 sm:grid-cols-2">{Object.entries(record.details).filter(([, value]) => value !== null && value !== undefined && value !== '').map(([label, value]) => <div key={label} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 break-words text-xs font-semibold text-slate-800">{String(value)}</div></div>)}</div>}
    {!!record.items?.length && <div className="mt-4"><h4 className="mb-2 text-xs font-bold text-slate-800">Products ({record.items.length})</h4><div className="max-h-64 space-y-2 overflow-y-auto">{record.items.map((item, index) => <div key={`${item.name}-${index}`} className="flex flex-col gap-2 rounded-xl border border-slate-100 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="break-words text-xs font-semibold text-slate-800">{item.name}</div><div className="mt-1 text-[10px] text-slate-500">Qty {item.quantity ?? '—'}{item.store ? ` · ${item.store}` : ''}</div></div><div className="flex shrink-0 items-center gap-2">{item.lineAmount !== null && <span className="text-xs font-bold text-slate-700">{money(item.lineAmount)}</span>}<span className={`rounded-full border px-2 py-1 text-[9px] font-bold ${statusClass(item.status)}`}>{formatStatusLabel(item.status)}</span></div></div>)}</div><div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">{[['Total Groceries', record.groceriesTotal], ['Pasabuy Fee', record.pasabuyFee], ['Total Bill', record.amount]].map(([label, value]) => <div key={String(label)} className="rounded-lg bg-slate-50 p-2"><div className="text-slate-500">{String(label)}</div><strong className="mt-1 block text-slate-800">{typeof value === 'number' ? money(value) : '—'}</strong></div>)}</div></div>}
  </>;

  const showExcelOrderFormat = section === 'orders' || (section === 'all' && recordType === 'orders');
  const showCategoryFormat = ['payments', 'expenses', 'inventory'].includes(displayedRecordType) && !showExcelOrderFormat;
  const getGroceriesTotal = (record: MasterlistRecord) => {
    if (record.groceriesTotal !== null && record.groceriesTotal !== undefined) return record.groceriesTotal;
    if (!record.items?.length || record.items.some(item => item.lineAmount === null)) return null;
    return roundMoney(record.items.reduce((sum, item) => sum + (item.lineAmount || 0), 0));
  };
  const printRows = filteredRows.flatMap(record => {
    if (record.kind !== 'orders') return [{ record, item: null as MasterlistItem | null, index: 0, isLast: true }];
    const items = record.items?.length ? record.items : [null];
    return items.map((item, index) => ({ record, item, index, isLast: index === items.length - 1 }));
  });
  const printRecordAmount = (record: MasterlistRecord) => record.amountLabel || (record.amount == null ? '—' : money(record.amount));
  const renderMasterlistPrint = () => <article id="printable-masterlist" className="buying-print-document buying-print-output detailed medium with-borders alternate-rows">
    <header className="buying-print-company-header"><img src={SHOPPER_LOGO_DATA_URL} alt="Your Shopper logo" className="buying-print-logo" /><div><h1>{businessInfo.storeName || 'DIONIX POS'}</h1><p>{businessInfo.address || 'San Angel, San Jose de Buenavista, Antique 5700'}</p><p>{businessInfo.tagline || 'Antique Pasabuy'}</p></div></header>
    <div className="buying-print-heading"><div><h2>Masterlist</h2><p>Record format follows the Buying List printout.</p><p>Selected range: {rangeLabel}</p></div><div className="buying-print-meta"><p>Date prepared: {new Date().toLocaleDateString('en-PH')}</p><p>Prepared by: {currentUser?.fullName || currentUser?.username || 'Staff'}</p><p>Record type: {recordType === 'all' ? 'All types' : recordKindLabel(recordType)}</p></div></div>
    <section className="buying-print-summary"><div><span>Total Records</span><strong>{summary.total}</strong></div><div><span>Orders</span><strong>{summary.orders}</strong></div><div><span>Payments Received</span><strong>{money(summary.payments)}</strong></div><div><span>Expenses</span><strong>{money(summary.expenses)}</strong></div></section>
    <table className="buying-print-table"><thead><tr><th>Date &amp; Time</th><th>Reference #</th><th>Name / Description</th><th>Bought / Stock</th><th>Store</th><th>Items</th><th>Price</th><th>Qty</th><th>S&amp;R / SM</th><th>Total Groceries</th><th>Pasabuy Fee</th><th>Total Bill / Amount</th><th>Record Type</th><th>Related Order / Method</th></tr></thead>
      <tbody>{printRows.map(({ record, item, index, isLast }, rowIndex) => {
        const status = item?.status || record.status;
        const rowStatus = record.status.toUpperCase().includes('CANCEL') ? 'CANCELLED' : status;
        return <tr key={`${record.id}-${index}`} className={`${buyingPrintStatusClass(rowStatus)} ${rowIndex % 2 ? 'alternate' : ''}`}>
          <td>{record.date ? new Date(record.date).toLocaleString('en-PH') : 'Date not recorded'}</td><td>{record.reference || '—'}</td><td>{record.description || '—'}</td><td>{formatStatusLabel(rowStatus)}</td><td>{item?.store || '—'}</td><td>{item?.name || '—'}</td><td>{item?.unitPrice == null ? '—' : money(item.unitPrice)}</td><td>{item?.quantity ?? '—'}</td><td>{item?.lineAmount == null ? '—' : money(item.lineAmount)}</td>
          <td>{record.kind === 'orders' && isLast ? getGroceriesTotal(record) == null ? '—' : money(getGroceriesTotal(record)!) : '—'}</td><td>{record.kind === 'orders' && isLast && record.pasabuyFee != null ? money(record.pasabuyFee) : '—'}</td><td>{record.kind === 'orders' ? isLast ? printRecordAmount(record) : '' : printRecordAmount(record)}</td><td>{recordKindLabel(record.kind)}</td><td>{[record.relatedOrder, record.paymentMethod].filter(Boolean).join(' · ') || '—'}</td>
        </tr>;
      })}</tbody></table>
    <section className="buying-print-signatures"><div><span>Prepared by</span><i /></div><div><span>Checked by</span><i /></div><div><span>Approved by</span><i /></div></section>
  </article>;
  const renderExcelOrderFormat = () => {
    const orderRows = pagedRows.filter(record => record.kind === 'orders');
    const itemRows = orderRows.flatMap(record => {
      const items = record.items?.length ? record.items : [null];
      return items.map((item, index) => ({ record, item, index, isLast: index === items.length - 1 }));
    });
    return <>
      <div className="border-b border-pink-100 bg-pink-50/60 px-4 py-2 text-[10px] text-slate-600">Order rows follow the Excel <strong>E tab</strong> layout. Amounts appear on the last item row for each order, as in the source sheet.</div>
      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[1510px] table-fixed text-left text-xs">
        <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500"><tr>
          <th className="w-[125px] px-3 py-3">Date &amp; Time</th><th className="w-[125px] px-3 py-3">Order #</th><th className="w-[155px] px-3 py-3">Name</th><th className="w-[125px] px-3 py-3">Bought / Stock</th><th className="w-[90px] px-3 py-3">Store</th><th className="min-w-[240px] px-3 py-3">Items</th><th className="w-[100px] px-3 py-3 text-right">Price</th><th className="w-[70px] px-3 py-3 text-right">Qty</th><th className="w-[110px] px-3 py-3 text-right">S&amp;R / SM</th><th className="w-[125px] px-3 py-3 text-right">Total Groceries</th><th className="w-[115px] px-3 py-3 text-right">Pasabuy Fee</th><th className="w-[120px] px-3 py-3 text-right">Total Bill</th><th className="w-[110px] px-3 py-3 text-right">Actions</th>
        </tr></thead><tbody className="divide-y divide-slate-100">{itemRows.map(({ record, item, index, isLast }) => <tr key={`${record.id}-${index}`} className={`transition ${buyingListRowClass(record.status.toUpperCase().includes('CANCEL') ? 'CANCELLED' : item?.status || record.status)}`}>
          <td className="px-3 py-2.5 text-[10px] text-slate-600">{index === 0 ? record.date ? new Date(record.date).toLocaleString('en-PH') : <span className="text-slate-400">Not recorded</span> : ''}</td>
          <td className="truncate px-3 py-2.5 font-mono text-[10px] font-bold text-slate-800" title={record.reference}>{index === 0 ? record.reference : ''}</td>
          <td className="truncate px-3 py-2.5 text-[10px] font-semibold text-slate-700" title={record.description}>{index === 0 ? record.description : ''}</td>
          <td className="px-3 py-2.5">{item && <span className={`inline-flex rounded-full px-2 py-1 text-[9px] font-bold ${buyingListBadgeClass(record.status.toUpperCase().includes('CANCEL') ? 'CANCELLED' : item.status)}`}>{formatStatusLabel(record.status.toUpperCase().includes('CANCEL') ? 'CANCELLED' : item.status)}</span>}</td>
          <td className="px-3 py-2.5 text-[10px] text-slate-600">{item?.store || '—'}</td>
          <td className="px-3 py-2.5 text-[10px] text-slate-800"><span className="block break-words">{item?.name || '—'}</span>{item?.sourceStatus && item.sourceStatus !== item.status && <span className="mt-0.5 block text-[9px] text-slate-400">Source: {item.sourceStatus}</span>}</td>
          <td className="whitespace-nowrap px-3 py-2.5 text-right text-[10px] text-slate-700">{item?.unitPrice == null ? '—' : money(item.unitPrice)}</td>
          <td className="px-3 py-2.5 text-right text-[10px] text-slate-700">{item?.quantity ?? '—'}</td>
          <td className="whitespace-nowrap px-3 py-2.5 text-right text-[10px] font-semibold text-slate-700">{item?.lineAmount == null ? '—' : money(item.lineAmount)}</td>
          <td className="whitespace-nowrap px-3 py-2.5 text-right text-[10px] font-semibold text-slate-700">{isLast && getGroceriesTotal(record) !== null ? money(getGroceriesTotal(record)!) : ''}</td>
          <td className="whitespace-nowrap px-3 py-2.5 text-right text-[10px] font-semibold text-slate-700">{isLast && record.pasabuyFee != null ? money(record.pasabuyFee) : ''}</td>
          <td className="whitespace-nowrap px-3 py-2.5 text-right text-[10px] font-extrabold text-slate-900">{isLast && record.amount != null ? money(record.amount) : ''}</td>
          <td className="px-2 py-2.5">{index === 0 ? renderActionButtons(record) : null}</td>
        </tr>)}</tbody>
      </table></div>
      <div className="space-y-3 p-3 md:hidden">{orderRows.map(record => <article key={record.id} className={`rounded-xl border border-slate-200 p-3 shadow-xs ${record.status.toUpperCase().includes('CANCEL') ? buyingListRowClass('CANCELLED') : 'bg-white'}`}>
        <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="font-mono text-[10px] font-extrabold text-slate-800">{record.reference}</div><div className="mt-1 break-words text-xs font-semibold text-slate-800">{record.description}</div><div className="mt-1 text-[10px] text-slate-500">{record.date ? new Date(record.date).toLocaleString('en-PH') : 'Date not recorded'}</div></div><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ${buyingListBadgeClass(record.status)}`}>{formatStatusLabel(record.status)}</span></div>
        <div className="mt-3 space-y-2">{record.items?.length ? record.items.map((item, index) => { const itemStatus = record.status.toUpperCase().includes('CANCEL') ? 'CANCELLED' : item.status; return <div key={`${item.name}-${index}`} className={`rounded-lg border border-slate-100 p-2.5 ${buyingListRowClass(itemStatus)}`}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="break-words text-[11px] font-semibold text-slate-800">{item.name}</div><div className="mt-1 text-[9px] text-slate-600">{item.store || 'Store not recorded'} · {item.unitPrice == null ? 'Price not recorded' : money(item.unitPrice)} × {item.quantity ?? '—'}</div></div><span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold ${buyingListBadgeClass(itemStatus)}`}>{formatStatusLabel(itemStatus)}</span></div><div className="mt-1 text-right text-[10px] font-bold text-slate-700">S&amp;R / SM: {item.lineAmount == null ? '—' : money(item.lineAmount)}</div></div>; }) : <div className="text-[10px] text-slate-500">No product lines recorded.</div>}</div>
        <div className="mt-3 grid grid-cols-3 gap-1.5 border-t border-slate-100 pt-2 text-[9px]"><div><div className="text-slate-500">Total Groceries</div><strong className="mt-0.5 block text-slate-800">{getGroceriesTotal(record) == null ? '—' : money(getGroceriesTotal(record)!)}</strong></div><div><div className="text-slate-500">Pasabuy Fee</div><strong className="mt-0.5 block text-slate-800">{record.pasabuyFee == null ? '—' : money(record.pasabuyFee)}</strong></div><div><div className="text-slate-500">Total Bill</div><strong className="mt-0.5 block text-slate-900">{record.amount == null ? '—' : money(record.amount)}</strong></div></div>
        <div className="mt-2 flex justify-end">{renderActionButtons(record)}</div>
      </article>)}</div>
      <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><span className="text-[10px] text-slate-500">Page {page} of {pageCount}</span><div className="flex items-center justify-end gap-2"><button onClick={() => setPage(value => Math.max(1, value - 1))} disabled={page <= 1} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[10px] font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" />Previous</button><button onClick={() => setPage(value => Math.min(pageCount, value + 1))} disabled={page >= pageCount} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[10px] font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40">Next<ChevronRight className="h-3.5 w-3.5" /></button></div></div>
    </>;
  };

  const renderCategoryMasterlistFormat = () => {
    const type = displayedRecordType;
    const isPayments = type === 'payments';
    const isExpenses = type === 'expenses';
    const isInventory = type === 'inventory';
    return <>
      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[1840px] table-fixed border-collapse text-left text-xs">
        <thead className="bg-pink-50 text-[10px] font-bold uppercase tracking-wide text-[#451323]"><tr>
          <th className="w-[125px] border border-slate-300 px-2 py-2.5">Date &amp; Time</th><th className="w-[125px] border border-slate-300 px-2 py-2.5">Reference #</th><th className="w-[160px] border border-slate-300 px-2 py-2.5">Name / Description</th><th className="w-[120px] border border-slate-300 px-2 py-2.5">Bought / Stock</th><th className="w-[95px] border border-slate-300 px-2 py-2.5">Store</th><th className="w-[250px] min-w-[250px] border border-slate-300 px-2 py-2.5">Items / Details</th><th className="w-[95px] border border-slate-300 px-2 py-2.5 text-right">Price</th><th className="w-[65px] border border-slate-300 px-2 py-2.5 text-right">Qty</th><th className="w-[100px] border border-slate-300 px-2 py-2.5 text-right">S&amp;R / SM</th><th className="w-[115px] border border-slate-300 px-2 py-2.5 text-right">Total Groceries</th><th className="w-[105px] border border-slate-300 px-2 py-2.5 text-right">Pasabuy Fee</th><th className="w-[115px] border border-slate-300 px-2 py-2.5 text-right">Total Bill / Amount</th><th className="w-[90px] border border-slate-300 px-2 py-2.5">Record Type</th><th className="w-[150px] border border-slate-300 px-2 py-2.5">Related Order / Method</th><th className="w-[105px] border border-slate-300 px-2 py-2.5 text-right">Actions</th>
        </tr></thead>
        <tbody>{pagedRows.map(record => {
          const detailText = isPayments ? record.paymentMethod || '—' : isExpenses ? [record.details?.Category, record.details?.Notes].filter(Boolean).join(' · ') || '—' : [record.details?.['Product SKU'] ? `SKU ${record.details['Product SKU']}` : '', record.details?.Note].filter(Boolean).join(' · ') || '—';
          const statusText = isInventory ? record.status : formatStatusLabel(record.status);
          return <tr key={record.id} className="transition hover:bg-pink-50/40">
            <td className="border border-slate-300 px-2 py-2 text-[10px] text-slate-600">{record.date ? new Date(record.date).toLocaleString('en-PH') : '—'}</td>
            <td className="break-all border border-slate-300 px-2 py-2 font-mono text-[10px] font-bold text-slate-800">{record.reference || '—'}</td>
            <td className="break-words border border-slate-300 px-2 py-2 text-[10px] font-semibold text-slate-800">{record.description || '—'}{isPayments && record.details?.['Customer phone'] && <span className="mt-0.5 block font-normal text-slate-500">{record.details['Customer phone']}</span>}</td>
            <td className="border border-slate-300 px-2 py-2 text-[9px] font-bold text-slate-700">{statusText || '—'}</td>
            <td className="border border-slate-300 px-2 py-2 text-[10px] text-slate-600">—</td>
            <td className="w-[250px] min-w-[250px] whitespace-normal break-words border border-slate-300 px-2 py-2 text-[10px] leading-4 text-slate-700">{detailText}</td>
            <td className="border border-slate-300 px-2 py-2 text-right text-[10px] text-slate-700">—</td>
            <td className="border border-slate-300 px-2 py-2 text-right text-[10px] text-slate-700">{isInventory ? record.amountLabel || '—' : '—'}</td>
            <td className="border border-slate-300 px-2 py-2 text-right text-[10px] text-slate-700">{isInventory ? record.status.replace(/^Stock\s*/i, '') || '—' : '—'}</td>
            <td className="border border-slate-300 px-2 py-2 text-right text-[10px] text-slate-700">—</td><td className="border border-slate-300 px-2 py-2 text-right text-[10px] text-slate-700">—</td>
            <td className="border border-slate-300 px-2 py-2 text-right text-[10px] font-extrabold text-slate-900">{isExpenses || isPayments ? money(record.amount || 0) : '—'}</td>
            <td className="border border-slate-300 px-2 py-2 text-[10px] text-slate-700">{recordKindLabel(record.kind)}</td>
            <td className="break-words border border-slate-300 px-2 py-2 text-[10px] text-pink-800">{isPayments ? [record.relatedOrder, record.paymentMethod].filter(Boolean).join(' · ') || '—' : isInventory ? record.relatedOrder || '—' : '—'}</td>
            <td className="border border-slate-300 px-2 py-2 text-right">{renderActionButtons(record)}</td>
          </tr>;
        })}</tbody>
      </table></div>
      <div className="space-y-3 p-3 md:hidden">{pagedRows.map(record => <article key={record.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-mono text-[10px] font-extrabold text-slate-800">{record.reference}</div><div className="mt-1 break-words text-xs font-semibold text-slate-900">{record.description || 'Description not recorded'}</div></div><span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-bold ${statusClass(record.status)}`}>{formatStatusLabel(record.status)}</span></div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500"><span>{record.date ? new Date(record.date).toLocaleString('en-PH') : 'Date not recorded'}</span>{isPayments && record.details?.['Customer phone'] && <span>{record.details['Customer phone']}</span>}{isPayments && <span>{record.paymentMethod || 'Method not recorded'}</span>}{isExpenses && <span>{record.details?.Category || 'Uncategorized'}</span>}{isInventory && <span>{record.amountLabel || 'Quantity change not recorded'}</span>}{record.relatedOrder && <span className="font-semibold text-pink-800">Order: {record.relatedOrder}</span>}</div>
        {isInventory && <div className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[10px] text-slate-600">{record.details?.['Product SKU'] && <div className="mb-1"><span className="font-bold text-slate-700">SKU: </span>{record.details['Product SKU']}</div>}<div><span className="font-bold text-slate-700">Movement: </span>{record.details?.Note || 'Stock adjustment'}<span className="ml-2 font-semibold text-slate-700">· Stock {record.status.replace(/^Stock\s*/i, '')}</span></div></div>}
        {isExpenses && record.details?.Notes && <div className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[10px] text-slate-600">{record.details.Notes}</div>}
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2"><span className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{isPayments ? 'Payment Amount' : isExpenses ? 'Expense Amount' : 'Stock Change'}</span><strong className="text-xs font-extrabold text-slate-900">{record.amountLabel || (record.amount === null ? '—' : money(record.amount))}</strong></div>
        <div className="mt-2 flex justify-end">{renderActionButtons(record)}</div>
      </article>)}</div>
    </>;
  };

  const sortButton = <button onClick={() => setSortDirection(current => current === 'desc' ? 'asc' : 'desc')} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-pink-200" aria-label={`Sort date ${sortDirection === 'desc' ? 'ascending' : 'descending'}`}>
    <CalendarDays className="h-4 w-4 text-pink-700" />Date <span className="text-slate-400">{sortDirection === 'desc' ? 'Newest' : 'Oldest'}</span>{sortDirection === 'desc' ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}
  </button>;

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="mb-1 flex items-center gap-2 text-pink-800"><Archive className="h-5 w-5" /><span className="text-[10px] font-extrabold uppercase tracking-[0.14em]">Masterlist / {title.title}</span></div>
        <h2 className="text-lg font-bold text-slate-900">{title.title}</h2>
        <p className="mt-1 text-xs text-slate-500">{title.description}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={printMasterlist} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-pink-200 hover:bg-pink-50"><Printer className="h-4 w-4 text-pink-700" />Print Masterlist</button>
        {sortButton}
      </div>
    </div>

    {section === 'all' && <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <SummaryCard title="Total Records" value={summary.total.toLocaleString()} caption="Matching current filters" icon={Database} />
      <SummaryCard title="Orders" value={summary.orders.toLocaleString()} caption="Order records" icon={Package} />
      <SummaryCard title="Payments Received" value={money(summary.payments)} caption="Recorded payments only" icon={CircleDollarSign} />
      <SummaryCard title="Expenses" value={money(summary.expenses)} caption="Recorded expenses" icon={Receipt} />
    </div>}

    <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-500"><Filter className="h-3.5 w-3.5" />Date range</span>
        {(['daily', 'weekly', 'monthly', 'yearly'] as const).map(value => <button key={value} onClick={() => setQuickRange(value)} className={`rounded-lg px-3 py-2 text-[11px] font-bold capitalize transition ${preset === value ? 'bg-[#451323] text-white' : 'bg-slate-50 text-slate-600 hover:bg-pink-50 hover:text-pink-800'}`}>{value}</button>)}
        <button onClick={() => setPreset('custom')} className={`rounded-lg px-3 py-2 text-[11px] font-bold transition ${preset === 'custom' ? 'bg-[#451323] text-white' : 'bg-slate-50 text-slate-600 hover:bg-pink-50 hover:text-pink-800'}`}>Custom Date Range</button>
        <button onClick={() => setQuickRange('all')} className={`rounded-lg px-3 py-2 text-[11px] font-bold transition ${preset === 'all' ? 'bg-[#451323] text-white' : 'bg-slate-50 text-slate-600 hover:bg-pink-50 hover:text-pink-800'}`}>All dates</button>
      </div>
      {preset === 'custom' && <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-end">
        <label className="flex-1 text-[10px] font-bold text-slate-500">From Date<input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} className="mt-1 block h-10 w-full rounded-xl border border-slate-200 px-3 text-xs text-slate-800 outline-none focus:border-pink-300 focus:ring-2 focus:ring-pink-100" /></label>
        <label className="flex-1 text-[10px] font-bold text-slate-500">To Date<input type="date" value={toDate} onChange={event => setToDate(event.target.value)} className="mt-1 block h-10 w-full rounded-xl border border-slate-200 px-3 text-xs text-slate-800 outline-none focus:border-pink-300 focus:ring-2 focus:ring-pink-100" /></label>
        <button onClick={applyCustomRange} className="h-10 rounded-xl bg-[#C90052] px-4 text-xs font-bold text-white transition hover:bg-[#E60063]">Apply Filters</button>
      </div>}
      <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-[minmax(180px,1fr)_180px_auto]">
        <label className="relative block"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search reference, customer, product..." className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none transition focus:border-pink-300 focus:ring-2 focus:ring-pink-100" /></label>
        <select value={recordType} onChange={event => setRecordType(event.target.value as RecordKind | 'all')} aria-label="Record type" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-pink-300"><option value="all">All record types</option><option value="orders">Orders</option><option value="payments">Payments</option><option value="expenses">Expenses</option><option value="inventory">Inventory movements</option></select>
        <button onClick={resetFilters} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"><RotateCcw className="h-3.5 w-3.5" />Reset</button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold text-slate-500"><CalendarDays className="h-3.5 w-3.5 text-pink-700" />Showing {rangeLabel}{appliedRange && <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">Undated imported records are outside date-filtered results</span>}</div>
    </section>

    {archiveError && section !== 'payments' && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">Historical workbook records could not be loaded. POS records are still available.</div>}
    {archiveLoading && <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500"><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-pink-300 border-t-transparent" />Loading historical records…</div>}

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {filteredRows.length === 0 ? <div className="p-10 text-center"><Archive className="mx-auto mb-2 h-9 w-9 text-slate-300" /><h3 className="text-sm font-bold text-slate-700">No records found for the selected filters.</h3><p className="mt-1 text-xs text-slate-500">Try a different date range or search term.</p></div> : <>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div className="text-[11px] font-semibold text-slate-500"><span className="font-bold text-slate-800">{filteredRows.length.toLocaleString()}</span> records</div><div className="text-[10px] text-slate-500">Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, filteredRows.length)}</div></div>
        {showExcelOrderFormat ? renderExcelOrderFormat() : showCategoryFormat ? renderCategoryMasterlistFormat() : <>
          <div className="hidden overflow-x-auto md:block"><table style={{ minWidth: showRelatedOrderColumn ? 1190 : showPaymentMethodColumn ? 1040 : 930 }} className="w-full table-fixed text-left text-xs">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500"><tr>
              <th className="w-[130px] px-3 py-3">Date &amp; Time</th><th className="w-[135px] px-3 py-3">Reference Number</th><th className="w-[105px] px-3 py-3">Record Type</th><th className="px-3 py-3">{descriptionColumnTitle}</th>{showRelatedOrderColumn && <th className="w-[140px] px-3 py-3">Related Order</th>}{showPaymentMethodColumn && <th className="w-[105px] px-3 py-3">Payment Method</th>}<th className="w-[105px] px-3 py-3 text-right">Amount</th><th className="w-[120px] px-3 py-3">Status</th><th className="w-[110px] px-3 py-3 text-right">Actions</th>
            </tr></thead><tbody className="divide-y divide-slate-100">{pagedRows.map(record => {
              const Icon = recordKindIcon(record.kind);
              return <tr key={record.id} className="transition hover:bg-pink-50/40">
                <td className="px-4 py-3 text-[10px] text-slate-600">{record.date ? new Date(record.date).toLocaleString('en-PH') : <span className="text-slate-400">Not recorded</span>}</td>
                <td className="truncate px-4 py-3 font-mono text-[10px] font-bold text-slate-800" title={record.reference}>{record.reference}</td>
                <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700"><Icon className="h-3 w-3 text-pink-700" />{recordKindLabel(record.kind)}</span></td>
                <td className="px-3 py-3 text-[11px] text-slate-700" title={record.description}><div className="truncate font-semibold" title={record.description}>{record.description || 'Description not recorded'}</div>{record.kind === 'expenses' && <div className="mt-1 truncate text-[9px] text-slate-500">{record.details?.Category || 'Expense'}</div>}{record.kind === 'inventory' && <><div className="mt-1 truncate text-[9px] text-slate-500" title={String(record.details?.Note || 'Stock movement')}>{record.details?.Note || 'Stock movement'}</div>{!showRelatedOrderColumn && record.relatedOrder && <div className="mt-1 truncate text-[9px] font-semibold text-pink-800" title={record.relatedOrder}>Order: {record.relatedOrder}</div>}</>}{record.kind === 'payments' && <>{record.details?.['Customer phone'] && <div className="mt-1 truncate text-[9px] text-slate-500">{record.details['Customer phone']}</div>}{!showRelatedOrderColumn && record.relatedOrder && <div className="mt-1 truncate text-[9px] font-semibold text-pink-800" title={record.relatedOrder}>Order: {record.relatedOrder}</div>}</>}{record.source && <div className="mt-1 text-[9px] font-medium text-slate-400">Historical workbook</div>}</td>
                {showRelatedOrderColumn && <td className="px-3 py-3 text-[10px] text-slate-600"><span className="truncate" title={record.relatedOrder}>{record.relatedOrder || '—'}</span></td>}{showPaymentMethodColumn && <td className="px-3 py-3 text-[10px] text-slate-600">{record.paymentMethod || '—'}</td>}
                <td className="px-4 py-3 text-right text-[11px] font-bold text-slate-900">{record.amountLabel || (record.amount === null ? '—' : money(record.amount))}</td>
                <td className="px-4 py-3"><span className={`inline-flex max-w-full truncate rounded-full border px-2 py-1 text-[9px] font-bold ${statusClass(record.status)}`} title={formatStatusLabel(record.status)}>{formatStatusLabel(record.status)}</span></td>
                <td className="px-3 py-3">{renderActionButtons(record)}</td>
              </tr>;
            })}</tbody>
          </table></div>
          <div className="space-y-3 p-3 md:hidden">{pagedRows.map(record => {
            const Icon = recordKindIcon(record.kind);
            return <article key={record.id} className="rounded-xl border border-slate-200 p-3 shadow-xs">
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate font-mono text-[10px] font-bold text-slate-800">{record.reference}</div><div className="mt-1 break-words text-xs font-semibold text-slate-800">{record.description}</div></div><span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-bold ${statusClass(record.status)}`}>{formatStatusLabel(record.status)}</span></div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-500"><span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 font-bold text-slate-700"><Icon className="h-3 w-3 text-pink-700" />{recordKindLabel(record.kind)}</span><span>{record.date ? new Date(record.date).toLocaleString('en-PH') : 'Date not recorded'}</span>{record.relatedOrder && <span className="rounded-md bg-pink-50 px-2 py-1 font-semibold text-pink-800">Related order: {record.relatedOrder}</span>}{record.paymentMethod && <span className="rounded-md bg-slate-100 px-2 py-1">{record.paymentMethod}</span>}{record.kind === 'inventory' && <span className="rounded-md bg-slate-100 px-2 py-1">{record.details?.Note || 'Stock movement'}</span>}</div>
              <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2"><div className="text-xs font-extrabold text-slate-900">{record.amountLabel || (record.amount === null ? '—' : money(record.amount))}</div>{renderActionButtons(record)}</div>
            </article>;
          })}</div>
          <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-[10px] text-slate-500">Page {page} of {pageCount}</span><div className="flex items-center justify-end gap-2"><button onClick={() => setPage(value => Math.max(1, value - 1))} disabled={page <= 1} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[10px] font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" />Previous</button><button onClick={() => setPage(value => Math.min(pageCount, value + 1))} disabled={page >= pageCount} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[10px] font-bold text-slate-600 disabled:cursor-not-allowed disabled:opacity-40">Next<ChevronRight className="h-3.5 w-3.5" /></button></div>
          </div>
        </>}
      </>}
    </section>

    {selectedRecord && <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedRecord(null); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="record-details-title" className="max-h-[92vh] w-full max-w-2xl overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-4 sm:px-5"><div className="min-w-0"><div className="text-[10px] font-extrabold uppercase tracking-wide text-pink-800">{recordKindLabel(selectedRecord.kind)} details</div><h3 id="record-details-title" className="mt-1 truncate text-sm font-extrabold text-slate-900">{selectedRecord.reference}</h3><p className="mt-1 text-[11px] text-slate-500">{selectedRecord.description}</p></div><button onClick={() => setSelectedRecord(null)} aria-label="Close details" className="rounded-lg p-2 text-slate-500 hover:bg-slate-200"><X className="h-4 w-4" /></button></div>
        <div className="max-h-[calc(92vh-150px)] overflow-y-auto p-4 sm:p-5"><div className="mb-4 flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusClass(selectedRecord.status)}`}>{selectedRecord.status}</span><span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] text-slate-600">{selectedRecord.date ? new Date(selectedRecord.date).toLocaleString('en-PH') : 'Date not recorded'}</span><span className="rounded-lg bg-pink-50 px-2.5 py-1 text-[10px] font-extrabold text-pink-800">{selectedRecord.amountLabel || (selectedRecord.amount === null ? 'Amount not recorded' : money(selectedRecord.amount))}</span></div>{renderRecordDetails(selectedRecord)}</div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/70 p-3"><button onClick={() => printRecord(selectedRecord)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-700"><Printer className="h-3.5 w-3.5" />Print</button>{selectedRecord.relatedOrderId && <button onClick={() => setActiveView('orders')} className="inline-flex items-center gap-1.5 rounded-lg bg-[#C90052] px-3 py-2 text-[10px] font-bold text-white"><ClipboardList className="h-3.5 w-3.5" />Open Orders</button>}<button onClick={() => setSelectedRecord(null)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-600"><Check className="h-3.5 w-3.5" />Done</button></div>
      </section>
    </div>}
    {createPortal(renderMasterlistPrint(), document.body)}
  </div>;
};

const SummaryCard: React.FC<{ title: string; value: string; caption: string; icon: React.ComponentType<{ className?: string }> }> = ({ title, value, caption, icon: Icon }) => <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4"><div className="flex items-start justify-between gap-2"><div className="text-[10px] font-bold text-slate-500 sm:text-[11px]">{title}</div><span className="rounded-xl bg-pink-50 p-2 text-pink-800"><Icon className="h-4 w-4" /></span></div><div className="mt-1 truncate text-base font-extrabold text-slate-900 sm:text-lg">{value}</div><div className="mt-0.5 text-[9px] text-slate-400">{caption}</div></div>;
