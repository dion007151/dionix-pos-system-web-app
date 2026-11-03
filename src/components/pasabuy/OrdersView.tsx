import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import {
  Package,
  Search,
  Filter,
  CreditCard,
  Printer,
  CheckCircle,
  XCircle,
  Eye,
  Plus,
  Clock,
  Truck,
  Building2,
  AlertCircle,
  FileText,
  Bell,
  Check,
  AlertTriangle,
  MapPin,
  Phone,
  MoreHorizontal,
  Trash2
} from 'lucide-react';
import { Order, OrderItem, OrderStatus, PaymentMethod, Product } from '../../types';
import { SHOPPER_LOGO_DATA_URL } from '../../assets/shopperLogo';
import {
  calculateOrderSummary,
  roundMoney
} from '../../services/calc';
import { archiveOrder, archiveOrders } from '../../services/orderDeletion';
import { ArchiveOrderDialog } from './ArchiveOrderDialog';

export const OrdersView: React.FC = () => {
  const { openReceiptModal, addToast, currentUser, logUserAction } = useApp();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStatusTab, setSelectedStatusTab] = useState<OrderStatus | 'ALL'>('ALL');

  // Selected Order for View Drawer or Payment Modal
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [invoiceOrder, setInvoiceOrder] = useState<Order | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [deleteOrderTarget, setDeleteOrderTarget] = useState<Order | null>(null);
  const [removeItemTarget, setRemoveItemTarget] = useState<OrderItem | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [selectedArchiveIds, setSelectedArchiveIds] = useState<string[]>([]);
  const [bulkArchiveConfirm, setBulkArchiveConfirm] = useState(false);

  const orders = useLiveQuery(() => db.orders.orderBy('createdAt').reverse().toArray(), []);
  const orderItems = useLiveQuery(() => db.orderItems.toArray(), []);
  const payments = useLiveQuery(() => db.payments.toArray(), []);
  const rateTiers = useLiveQuery(() => db.rateTiers.toArray(), []);
  const products = useLiveQuery(() => db.products.toArray(), []);

  const activeItems = (orderItems || []).filter(item => {
    const order = (orders || []).find(candidate => candidate.id === item.orderId);
    return order && !order.isArchived && order.status !== 'COMPLETED' && order.status !== 'CANCELLED';
  });
  const unavailableItems = activeItems.filter(item => item.status === 'UNAVAILABLE');
  const availableAgainItems = activeItems.filter(item => item.status === 'AVAILABLE_AGAIN');
  const awaitingActionItems = activeItems.filter(item => item.availabilityHistory?.[item.availabilityHistory.length - 1]?.requiresStaffAction);
  const affectedOrderIds = [...new Set([...unavailableItems, ...availableAgainItems, ...awaitingActionItems].map(item => item.orderId))];
  const canManagePurchasingIssues = currentUser?.role !== 'Shopper';

  // Filter Orders
  const filteredOrders = (orders || []).filter(order => {
    if (order.isArchived) return false;
    const matchesTab = selectedStatusTab === 'ALL'
      ? order.status !== 'COMPLETED'
      : order.status === selectedStatusTab;
    const matchesSearch =
      !searchQuery ||
      order.orderNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.customerName && order.customerName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (order.customerPhone && order.customerPhone.includes(searchQuery));

    return matchesTab && matchesSearch;
  });

  // Handle Mark Completed
  const handleMarkCompleted = async (order: Order) => {
    const latestOrder = await db.orders.get(order.id);
    if (!latestOrder || latestOrder.status === 'COMPLETED' || latestOrder.status === 'CANCELLED') return;
    const [latestItems, latestPayments] = await Promise.all([
      db.orderItems.where('orderId').equals(order.id).toArray(),
      db.payments.where('orderId').equals(order.id).toArray()
    ]);
    const latestSummary = calculateOrderSummary({ ...latestOrder, items: latestItems, payments: latestPayments }, rateTiers);
    if (latestSummary.paymentStatus !== 'PAID') {
      addToast('The order can only be completed after it is fully paid.', 'error');
      return;
    }
    await db.orders.update(order.id, {
      status: 'COMPLETED',
      updatedAt: new Date().toISOString()
    });
    try {
      await logUserAction('COMPLETE_ORDER', `Marked order #${order.orderNo} as Completed`);
    } catch (e) {
      console.warn('Audit log failed:', e);
    }
    addToast(`Order ${order.orderNo} marked as Completed!`, 'success');
  };

  // Handle Cancel Order
  const handleCancelOrder = async (order: Order) => {
    if (!confirm(`Are you sure you want to cancel ${order.orderNo}?`)) return;
    await db.orders.update(order.id, {
      status: 'CANCELLED',
      updatedAt: new Date().toISOString()
    });
    try {
      await logUserAction('CANCEL_ORDER', `Cancelled order #${order.orderNo}`);
    } catch (e) {
      console.warn('Audit log failed:', e);
    }
    addToast(`Order ${order.orderNo} cancelled`, 'info');
  };

  const handleDeleteOrder = async (order: Order) => {
    if (archiving) return;
    setArchiving(true);
    try {
      const orderNo = await archiveOrder(order.id, currentUser?.role || 'Shopper', currentUser?.fullName || currentUser?.username || 'Staff');
      setDeleteOrderTarget(null);
      addToast(`Order ${orderNo} successfully moved to Archive.`, 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Unable to archive this order. Please try again.', 'error');
    } finally {
      setArchiving(false);
    }
  };

  const handleBulkArchive = async () => {
    if (!selectedArchiveIds.length || archiving) return;
    setArchiving(true);
    try {
      const count = await archiveOrders(selectedArchiveIds, currentUser?.role || 'Shopper', currentUser?.fullName || currentUser?.username || 'Staff');
      setSelectedArchiveIds([]);
      setBulkArchiveConfirm(false);
      addToast(`${count} order${count === 1 ? '' : 's'} successfully moved to Archive.`, 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Unable to archive the selected orders. Please try again.', 'error');
    } finally { setArchiving(false); }
  };

  // Open Payment Modal
  const handleOpenPayment = (order: Order) => {
    const items = (orderItems || []).filter(i => i.orderId === order.id);
    const orderPayments = (payments || []).filter(p => p.orderId === order.id);
    const summary = calculateOrderSummary({ ...order, items, payments: orderPayments }, rateTiers);

    setSelectedOrder(order);
    setPaymentAmount(String(summary.balance > 0 ? summary.balance : summary.grandTotal));
    setPaymentMethod('Cash');
    setPaymentReference('');
    setShowPaymentModal(true);
  };

  // Save Payment
  const handleSavePayment = async () => {
    if (!selectedOrder) return;
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      addToast('Please enter a valid payment amount', 'error');
      return;
    }

    const newPayment = {
      id: 'pay-' + Math.random().toString(36).substring(2, 9),
      orderId: selectedOrder.id,
      amount: roundMoney(amount),
      method: paymentMethod,
      referenceNo: paymentReference.trim() || undefined,
      paymentDate: new Date().toISOString()
    };

    await db.payments.add(newPayment);
    try {
      await logUserAction('RECORD_PAYMENT', `Recorded payment of ₱${newPayment.amount.toFixed(2)} via ${paymentMethod} for order #${selectedOrder.orderNo}`);
    } catch (e) {
      console.warn('Audit log failed:', e);
    }
    addToast(`Payment of ₱${newPayment.amount.toFixed(2)} recorded via ${paymentMethod}`, 'success');
    setShowPaymentModal(false);
  };

  const recordItemAction = async (item: OrderItem, action: string, updates: Partial<OrderItem> = {}, details: Record<string, unknown> = {}) => {
    const current = await db.orderItems.get(item.id);
    if (!current) return;
    const history = current.availabilityHistory || [];
    await db.orderItems.update(item.id, {
      ...updates,
      availabilityHistory: [...history, {
        action,
        at: new Date().toISOString(),
        by: currentUser?.fullName || currentUser?.username || 'Order staff',
        previousStatus: current.status,
        ...details
      }]
    });
  };

  const handleConfirmAvailable = async (item: OrderItem) => {
    await recordItemAction(item, 'Available again confirmed by staff', {
      status: 'PENDING', unavailableReason: undefined, unavailableAt: undefined, unavailableBy: undefined
    }, { nextStatus: 'PENDING' });
    addToast(`${item.productName} is cleared to continue processing`, 'success');
  };

  const handleHoldItem = async (item: OrderItem) => {
    await recordItemAction(item, 'Item placed on hold / waiting for stock', { status: 'BACKORDER' }, { nextStatus: 'BACKORDER' });
    addToast(`${item.productName} remains on the order and is waiting for stock`, 'info');
  };

  const handleRemoveUnavailable = async (item: OrderItem) => {
    await recordItemAction(item, 'Unavailable item removed from customer order after confirmation', {
      status: 'CANCELLED', actualPrice: 0, purchasedQty: 0
    }, { nextStatus: 'CANCELLED' });
    addToast(`${item.productName} removed; original item history retained`, 'info');
  };

  const handleNotifyCustomer = async (item: OrderItem, decision: 'PENDING' | 'ACCEPTED' | 'DECLINED') => {
    const action = decision === 'PENDING' ? 'Customer notified about unavailable item' : `Customer ${decision.toLowerCase()} alternative / resolution`;
    await recordItemAction(item, action, {}, { customerDecision: decision });
    addToast(decision === 'PENDING' ? `Contact with ${((orders || []).find(order => order.id === item.orderId)?.customerName) || 'customer'} recorded` : `Customer response recorded: ${decision.toLowerCase()}`, 'info');
  };

  const handleReplaceWithAlternative = async (item: OrderItem, alternative: Product) => {
    const difference = alternative.price - item.estimatedPrice;
    if (!confirm(`Replace ${item.productName} with ${alternative.name}?\n\nAvailable stock: ${alternative.stockQuantity || 0} ${alternative.unit}\nOld price: ₱${item.estimatedPrice.toFixed(2)}\nNew price: ₱${alternative.price.toFixed(2)}\nPrice difference per item: ${difference >= 0 ? '+' : '−'}₱${Math.abs(difference).toFixed(2)}\n\nThis changes the active order line and saves the original product in history.`)) return;
    const current = await db.orderItems.get(item.id);
    if (!current) return;
    await db.orderItems.update(item.id, {
      productName: alternative.name, productId: alternative.id, barcode: alternative.barcode,
      storeName: alternative.store, unit: alternative.unit, estimatedPrice: alternative.price,
      status: 'PENDING', actualPrice: undefined, unavailableReason: undefined, unavailableAt: undefined, unavailableBy: undefined,
      originalProductName: current.originalProductName || current.productName,
      originalProductId: current.originalProductId || current.productId,
      originalBarcode: current.originalBarcode || current.barcode,
      availabilityHistory: [...(current.availabilityHistory || []), {
        action: 'Alternative product applied with staff confirmation', at: new Date().toISOString(), by: currentUser?.fullName || currentUser?.username || 'Order staff',
        reason: current.unavailableReason, previousStatus: current.status, nextStatus: 'PENDING',
        alternativeProductId: alternative.id, alternativeProductName: alternative.name,
        alternativeSupplier: alternative.store, alternativePrice: alternative.price, priceDifference: difference
      }]
    });
    addToast(`${alternative.name} substituted; order total recalculated`, 'success');
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-pink-700" />
            <span>Purchase Orders Directory</span>
          </h2>
          <p className="text-xs text-slate-500">
            Track order fulfillment status, customer balances, payments, and print receipts.
          </p>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Purchasing notifications">
        {[
          { label: 'Affected orders', count: affectedOrderIds.length, tone: 'border-rose-200 bg-rose-50 text-rose-800', items: activeItems.filter(item => item.status === 'UNAVAILABLE' || item.status === 'AVAILABLE_AGAIN' || item.availabilityHistory?.[item.availabilityHistory.length - 1]?.requiresStaffAction) },
          { label: 'Unavailable products', count: new Set(unavailableItems.map(item => item.productId || item.barcode || item.productName)).size, tone: 'border-red-200 bg-red-50 text-red-800', items: unavailableItems },
          { label: 'Awaiting staff action', count: new Set([...unavailableItems, ...availableAgainItems, ...awaitingActionItems].map(item => item.orderId)).size, tone: 'border-amber-200 bg-amber-50 text-amber-900', items: [...unavailableItems, ...availableAgainItems, ...awaitingActionItems] },
          { label: 'Available again', count: new Set(availableAgainItems.map(item => item.productId || item.barcode || item.productName)).size, tone: 'border-emerald-200 bg-emerald-50 text-emerald-800', items: availableAgainItems }
        ].map(card => (
          <button key={card.label} type="button" onClick={() => {
            const target = card.items[0];
            if (target) {
              setSelectedStatusTab('ALL');
              setExpandedOrderId(target.orderId);
              window.setTimeout(() => document.getElementById(`order-${target.orderId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
            }
          }} className={`rounded-xl border p-3 text-left transition hover:shadow-sm ${card.tone}`}>
            <span className="block text-xl font-black">{card.count}</span>
            <span className="text-[11px] font-bold">{card.label}</span>
          </button>
        ))}
      </section>

      {/* Filter & Search Bar */}
      <div className="bg-white p-3.5 border border-slate-200/80 rounded-2xl shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by order #, customer name, or phone..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-semibold no-scrollbar">
          {[
            { id: 'ALL', label: 'All Orders' },
            { id: 'READY_TO_BUY', label: 'Ready to Buy' },
            { id: 'BUYING_NOW', label: 'Buying Now' },
            { id: 'BOUGHT', label: 'Bought / Ready' },
            { id: 'COMPLETED', label: 'Completed' },
            { id: 'CANCELLED', label: 'Cancelled' }
          ].map(tab => {
            const isSelected = selectedStatusTab === tab.id;
            const count =
              tab.id === 'ALL'
                ? orders?.filter(order => !order.isArchived && order.status !== 'COMPLETED').length || 0
                : orders?.filter(o => !o.isArchived && o.status === tab.id).length || 0;

            return (
              <button
                key={tab.id}
                onClick={() => setSelectedStatusTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl whitespace-nowrap transition-all ${isSelected
                  ? 'bg-[#C90052] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${isSelected ? 'bg-white text-pink-900' : 'bg-slate-200 text-slate-700'
                    }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Orders List */}
      <div className="space-y-3">
        {(currentUser?.role === 'Admin' || currentUser?.role === 'Staff') && filteredOrders.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"><button type="button" onClick={() => setSelectedArchiveIds(selectedArchiveIds.length === filteredOrders.length ? [] : filteredOrders.map(order => order.id))} className="text-[11px] font-semibold text-slate-600">{selectedArchiveIds.length === filteredOrders.length ? 'Clear selection' : `Select visible orders (${filteredOrders.length})`}</button>{selectedArchiveIds.length > 0 && <button type="button" disabled={archiving} onClick={() => setBulkArchiveConfirm(true)} className="rounded-lg bg-amber-600 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50">Move {selectedArchiveIds.length} selected to Archive</button>}</div>}
        {filteredOrders.length === 0 ? (
          <div className="p-8 text-center bg-white border border-slate-200/80 rounded-2xl">
            <Package className="w-10 h-10 text-slate-400 mx-auto mb-2 opacity-50" />
            <h3 className="font-bold text-slate-800 text-sm">No orders matching criteria</h3>
            <p className="text-xs text-slate-500 mt-1">Try resetting the filter tabs or search query.</p>
          </div>
        ) : (
          filteredOrders.map(order => {
            const items = (orderItems || []).filter(i => i.orderId === order.id);
            const flaggedItems = items.filter(item => ['UNAVAILABLE', 'AVAILABLE_AGAIN', 'BACKORDER', 'REORDER'].includes(item.status) || item.availabilityHistory?.[item.availabilityHistory.length - 1]?.requiresStaffAction);
            const orderPayments = (payments || []).filter(p => p.orderId === order.id);
            const summary = calculateOrderSummary(
              { ...order, items, payments: orderPayments },
              rateTiers
            );

            return (
              <article
                key={order.id}
                id={"order-" + order.id}
                className="space-y-3 rounded-2xl border border-[#F0DDE4] bg-white p-4 font-[Inter,Arial,sans-serif] shadow-sm transition-all hover:border-pink-200 hover:shadow-md sm:p-5"
              >
                <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
                  {(currentUser?.role === 'Admin' || currentUser?.role === 'Staff') && <input type="checkbox" aria-label={`Select ${order.orderNo} for archive`} checked={selectedArchiveIds.includes(order.id)} onChange={event => setSelectedArchiveIds(ids => event.target.checked ? [...ids, order.id] : ids.filter(id => id !== order.id))} className="accent-pink-700" />}
                  <span className="mr-1 rounded-lg bg-[#451323] px-2.5 py-1 font-mono text-[11px] font-extrabold tracking-wide text-white">{order.orderNo}</span>
                  <span className={"rounded-full px-2.5 py-1 text-[10px] font-bold " + (order.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' : order.status === 'CANCELLED' ? 'bg-slate-200 text-slate-700' : order.status === 'BUYING_NOW' ? 'bg-blue-100 text-blue-800' : order.status === 'BOUGHT' ? 'bg-pink-100 text-pink-800' : order.status === 'READY_TO_BUY' || order.status === 'WAITING_CONFIRMATION' ? 'bg-sky-50 text-sky-800' : 'bg-slate-100 text-slate-700')}>{order.status.replace(/_/g, ' ')}</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-700">{order.deliveryType === 'DELIVERY' ? <Truck className="h-3 w-3 text-pink-700" /> : <Building2 className="h-3 w-3 text-slate-600" />}{order.deliveryType === 'DELIVERY' ? 'DELIVERY' : 'PICKUP'}</span>
                  <span className={"rounded-full border px-2.5 py-1 text-[10px] font-bold " + (summary.paymentStatus === 'PAID' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : summary.paymentStatus === 'PARTIAL' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-rose-200 bg-rose-50 text-rose-800')}>{summary.paymentStatus === 'PARTIAL' ? 'PARTIALLY PAID' : summary.paymentStatus}</span>
                </header>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_270px] lg:gap-6">
                  <section className="min-w-0 space-y-3">
                    <div>
                      <h3 className="text-base font-extrabold text-[#202235]">{order.customerName || 'Walk-in Customer'}</h3>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#737B91]">
                        {order.customerPhone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{order.customerPhone}</span>}
                        {order.deliveryType === 'DELIVERY' && order.address && <span className="inline-flex items-start gap-1"><MapPin className="mt-0.5 h-3 w-3 shrink-0" /><span className="break-words">{order.address}</span></span>}
                      </div>
                      <p className="mt-1 text-[10px] font-medium text-[#737B91]">{items.length} {items.length === 1 ? 'item' : 'items'} · {items.filter(i => i.status === 'PURCHASED' || i.status === 'BOUGHT_FROM_STOCK').length} bought{order.deliveryType === 'DELIVERY' ? ' · Delivery fee ₱' + summary.delivery.toFixed(2) : ''}</p>
                    </div>

                    <div className="border-t border-slate-100 pt-2.5">
                      <p className="mb-1.5 text-[9px] font-extrabold uppercase tracking-[0.14em] text-[#737B91]">Products</p>
                      {items.length ? <div className="divide-y divide-slate-100">
                        {items.map(item => {
                          const statusLabel = item.status === 'UNAVAILABLE' ? 'NOT AVAILABLE' : item.status === 'AVAILABLE_AGAIN' ? 'AVAILABLE AGAIN' : item.status === 'BACKORDER' ? 'BACKORDER' : item.status === 'REORDER' ? 'REORDER' : item.status === 'CANCELLED' ? 'CANCELLED' : item.status === 'PURCHASED' || item.status === 'BOUGHT_FROM_STOCK' ? 'BOUGHT' : item.status === 'ALTERNATIVE_SELECTED' ? 'ALTERNATIVE SELECTED' : '';
                          const statusStyle = item.status === 'UNAVAILABLE' ? 'border-red-200 bg-red-50 text-red-800' : item.status === 'AVAILABLE_AGAIN' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : item.status === 'BACKORDER' ? 'border-orange-200 bg-orange-50 text-orange-900' : item.status === 'REORDER' ? 'border-amber-200 bg-amber-50 text-amber-900' : item.status === 'CANCELLED' ? 'border-slate-200 bg-slate-100 text-slate-600' : item.status === 'ALTERNATIVE_SELECTED' ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800';
                          const unitPrice = item.actualPrice !== undefined && item.actualPrice > 0 ? item.actualPrice : item.estimatedPrice;
                          const lineTotal = item.status === 'CANCELLED' ? 0 : roundMoney(unitPrice * item.qty);
                          return <div key={item.id} className={"grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2 " + (item.status === 'CANCELLED' ? 'text-slate-400' : '')}>
                            <div className="min-w-0">
                              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="shrink-0 text-[11px] font-bold text-[#451323]">{item.qty}×</span>
                                <span className={"min-w-0 break-words text-[11px] font-semibold " + (item.status === 'CANCELLED' ? 'text-slate-500 line-through' : 'text-[#202235]')}>{item.productName}</span>
                                {statusLabel && <span className={"shrink-0 rounded-md border px-1.5 py-0.5 text-[9px] font-extrabold " + statusStyle}>{statusLabel}</span>}
                              </div>
                              <p className="mt-0.5 pl-5 text-[9px] text-[#737B91]">₱{roundMoney(unitPrice).toFixed(2)} / {item.unit}{item.notes ? ' · ' + item.notes : ''}</p>
                            </div>
                            <span className={"whitespace-nowrap text-[11px] font-bold " + (item.status === 'CANCELLED' ? 'text-slate-400 line-through' : 'text-[#202235]')}>{item.status === 'CANCELLED' ? '₱0.00' : '₱' + lineTotal.toFixed(2)}</span>
                          </div>;
                        })}
                      </div> : <p className="py-2 text-[11px] text-slate-500">No products on this order.</p>}
                    </div>
                    {flaggedItems.length > 0 && <button type="button" onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] font-bold text-rose-800 transition hover:bg-rose-100"><Bell className="h-3.5 w-3.5" />{flaggedItems.length} {flaggedItems.length === 1 ? 'item needs' : 'items need'} attention · {expandedOrderId === order.id ? 'Hide' : 'Review Items'}</button>}
                  </section>

                  <aside className="flex flex-col justify-between gap-3 border-t border-slate-100 pt-3 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                    <div className="grid grid-cols-3 divide-x divide-slate-200 rounded-xl border border-slate-100 bg-[#FFF9FB] px-2 py-3 text-center">
                      <div className="px-1"><span className="block text-[9px] font-bold uppercase tracking-wide text-[#737B91]">Total</span><span className="mt-1 block whitespace-nowrap text-xs font-black text-[#202235]">₱{summary.grandTotal.toFixed(2)}</span></div>
                      <div className="px-1"><span className="block text-[9px] font-bold uppercase tracking-wide text-[#737B91]">Paid</span><span className="mt-1 block whitespace-nowrap text-xs font-black text-emerald-700">₱{summary.paid.toFixed(2)}</span></div>
                      <div className="px-1"><span className="block text-[9px] font-bold uppercase tracking-wide text-[#737B91]">Balance</span><span className={"mt-1 block whitespace-nowrap text-xs font-black " + (summary.balance > 0 ? 'text-red-600' : 'text-emerald-700')}>₱{summary.balance.toFixed(2)}</span></div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
                      {summary.balance > 0 && order.status !== 'CANCELLED' && <button onClick={() => handleOpenPayment(order)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#E6005C] px-3 py-2 text-[10px] font-bold text-white shadow-sm transition hover:bg-[#c90052]"><CreditCard className="h-3.5 w-3.5" />Pay</button>}
                      <button onClick={() => setInvoiceOrder({ ...order, items, payments: orderPayments })} className="inline-flex items-center gap-1.5 rounded-lg border border-[#F0DDE4] bg-white px-2.5 py-2 text-[10px] font-semibold text-[#451323] transition hover:bg-pink-50" title="View or print invoice"><FileText className="h-3.5 w-3.5" />Invoice</button>
                      <button onClick={() => openReceiptModal({ order: { ...order, items, payments: orderPayments } })} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-semibold text-slate-700 transition hover:bg-slate-50" title="Print thermal receipt"><Printer className="h-3.5 w-3.5" />Print</button>
                      {order.status !== 'COMPLETED' && order.status !== 'CANCELLED' && <button onClick={() => void handleMarkCompleted(order)} disabled={summary.paymentStatus !== 'PAID'} title={summary.paymentStatus !== 'PAID' ? 'Record full payment before completing this order' : 'Mark this paid order complete'} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-2 text-[10px] font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"><CheckCircle className="h-3.5 w-3.5" />Complete</button>}
                      <details className="relative">
                        <summary className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50" aria-label="More order actions"><MoreHorizontal className="h-4 w-4" /></summary>
                        <div className="absolute right-0 top-9 z-20 min-w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                          {order.status !== 'CANCELLED' && order.status !== 'COMPLETED' && <button onClick={() => handleCancelOrder(order)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] font-semibold text-red-700 hover:bg-red-50"><XCircle className="h-3.5 w-3.5" />Cancel order</button>}
                          {(currentUser?.role === 'Admin' || currentUser?.role === 'Staff') && <button onClick={() => setDeleteOrderTarget(order)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] font-semibold text-slate-700 hover:bg-amber-50"><Trash2 className="h-3.5 w-3.5 text-amber-700" />Move to Archive</button>}
                        </div>
                      </details>
                    </div>
                  </aside>
                </div>
                {flaggedItems.length > 0 && expandedOrderId === order.id && <div className="space-y-3 border-t border-slate-200 pt-3">
                  <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-700"><AlertTriangle className="h-4 w-4 text-red-600" />Purchasing updates for {order.orderNo}</h4>
                  {flaggedItems.map(item => {
                    const latest = item.availabilityHistory?.[item.availabilityHistory.length - 1];
                    const matchingProduct = (products || []).find(product => item.productId ? product.id === item.productId : item.barcode ? product.barcode === item.barcode : product.name.trim().toLowerCase() === item.productName.trim().toLowerCase());
                    const alternatives = (products || []).filter(product => product.id !== matchingProduct?.id && (product.stockQuantity || 0) > 0 && (!matchingProduct?.category || product.category === matchingProduct.category)).slice(0, 3);
                    const latestNeedsAction = !!latest?.requiresStaffAction;
                    return <article key={item.id} className={`rounded-xl border p-3 ${item.status === 'UNAVAILABLE' ? 'border-red-300 bg-red-50' : item.status === 'AVAILABLE_AGAIN' ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-slate-900">{item.productName}</strong><span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${item.status === 'UNAVAILABLE' ? 'bg-red-200 text-red-900' : item.status === 'AVAILABLE_AGAIN' ? 'bg-emerald-200 text-emerald-900' : 'bg-amber-200 text-amber-900'}`}>{item.status === 'UNAVAILABLE' ? 'NOT AVAILABLE' : item.status === 'AVAILABLE_AGAIN' ? 'AVAILABLE AGAIN' : item.status.replace(/_/g, ' ')}</span>{latestNeedsAction && <span className="rounded-full bg-orange-200 px-2 py-0.5 text-[10px] font-bold text-orange-900">STAFF ACTION REQUIRED</span>}</div>
                          <p className="mt-1 text-xs text-slate-700">SKU / barcode: {item.barcode || matchingProduct?.barcode || 'Not recorded'} · Order: {order.orderNo} · Customer: {order.customerName || 'Walk-in'} · Quantity: {item.qty} {item.unit}</p>
                          {(item.unavailableReason || latest?.reason) && <p className="mt-1 text-xs font-semibold text-red-900">Reason: {item.unavailableReason || latest?.reason}</p>}
                          {latest && <p className="mt-1 text-[10px] text-slate-600">Updated {new Date(latest.at).toLocaleString()} by {latest.by}{latest.action ? ` · ${latest.action}` : ''}</p>}
                        </div>
                        {item.status === 'AVAILABLE_AGAIN' && canManagePurchasingIssues && <button type="button" onClick={() => void handleConfirmAvailable(item)} className="rounded-lg bg-emerald-700 px-3 py-2 text-[11px] font-bold text-white hover:bg-emerald-800">Confirm available · continue order</button>}
                      </div>
                      {item.status === 'UNAVAILABLE' && canManagePurchasingIssues && <div className="mt-3 space-y-3">
                        <div><p className="mb-1 text-[10px] font-black uppercase text-slate-600">Available alternatives · stock · price difference</p>{alternatives.length ? <div className="flex flex-wrap gap-2">{alternatives.map(product => <button key={product.id} type="button" onClick={() => void handleReplaceWithAlternative(item, product)} className="rounded-lg border border-blue-300 bg-white px-2.5 py-2 text-left text-[10px] font-semibold text-blue-900 hover:bg-blue-50">Replace with {product.name}<span className="block font-normal">Stock {product.stockQuantity} {product.unit} · ₱{product.price.toFixed(2)} ({product.price - item.estimatedPrice >= 0 ? '+' : '−'}₱{Math.abs(product.price - item.estimatedPrice).toFixed(2)})</span></button>)}</div> : <p className="text-[11px] text-slate-600">No in-stock catalog alternatives found in this category.</p>}</div>
                        <div className="flex flex-wrap gap-2">
                          {order.customerPhone && <a href={`sms:${encodeURIComponent(order.customerPhone)}?body=${encodeURIComponent(`Hello ${order.customerName || 'there'}, ${item.productName} in order ${order.orderNo} is currently unavailable. ${item.unavailableReason ? `Reason: ${item.unavailableReason}. ` : ''}Would you like us to offer an alternative?`)}`} className="rounded-lg border border-blue-200 bg-white px-2.5 py-2 text-[10px] font-bold text-blue-900 hover:bg-blue-50">Open SMS draft</a>}
                          <button type="button" onClick={() => void handleNotifyCustomer(item, 'PENDING')} className="rounded-lg bg-blue-700 px-2.5 py-2 text-[10px] font-bold text-white hover:bg-blue-800">Record customer notified</button>
                          <button type="button" onClick={() => void handleNotifyCustomer(item, 'ACCEPTED')} className="rounded-lg border border-blue-200 bg-white px-2.5 py-2 text-[10px] font-bold text-blue-900">Customer accepted alternative</button>
                          <button type="button" onClick={() => void handleNotifyCustomer(item, 'DECLINED')} className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[10px] font-bold text-slate-800">Customer declined</button>
                          <button type="button" onClick={() => void handleHoldItem(item)} className="rounded-lg bg-orange-600 px-2.5 py-2 text-[10px] font-bold text-white hover:bg-orange-700">Hold / waiting for stock</button>
                          <button type="button" onClick={() => setRemoveItemTarget(item)} className="rounded-lg border border-red-300 bg-white px-2.5 py-2 text-[10px] font-bold text-red-800 hover:bg-red-100">Remove item</button>
                        </div>
                      </div>}
                      {latestNeedsAction && item.status !== 'UNAVAILABLE' && item.status !== 'AVAILABLE_AGAIN' && canManagePurchasingIssues && <button type="button" onClick={() => void recordItemAction(item, 'Staff reviewed buying cancellation; next action determined', {}, { requiresStaffAction: false })} className="mt-3 rounded-lg bg-orange-700 px-3 py-2 text-[10px] font-bold text-white hover:bg-orange-800">Mark reviewed</button>}
                    </article>;
                  })}
                  <p className="text-[10px] text-slate-500">SMS opens as a draft in the device messaging app. Staff send it manually, then record the contact and customer response here.{!canManagePurchasingIssues && ' Ask an administrator or staff member to resolve this item.'}</p>
                </div>}
              </article>
            );
          })
        )}
      </div>

      {/* Payment Recording Modal */}
      {showPaymentModal && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5 border border-slate-200 space-y-4">
            <div>
              <span className="text-[10px] font-bold text-pink-700 uppercase tracking-wider">
                Record Payment
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-0.5">
                {selectedOrder.orderNo} · {selectedOrder.customerName}
              </h3>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Payment Amount (₱) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  autoFocus
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(e.target.value)}
                  className="w-full px-3 py-2 text-lg font-black text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
                >
                  <option value="Cash">Cash (On Hand)</option>
                  <option value="GCash">GCash</option>
                  <option value="Maya">Maya</option>
                  <option value="COD">Cash on Delivery (COD)</option>
                  <option value="BankTransfer">Bank Transfer</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Reference No. / Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. GCash Ref #123456"
                  value={paymentReference}
                  onChange={e => setPaymentReference(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="flex-1 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePayment}
                className="flex-1 py-2 text-xs font-bold text-white bg-[#C90052] rounded-xl hover:bg-[#E60063] shadow-xs"
              >
                Save Payment
              </button>
            </div>
          </div>
        </div>
      )}
      {deleteOrderTarget && <ArchiveOrderDialog order={deleteOrderTarget} items={(orderItems || []).filter(item => item.orderId === deleteOrderTarget.id)} busy={archiving} onCancel={() => setDeleteOrderTarget(null)} onConfirm={() => void handleDeleteOrder(deleteOrderTarget)} />}
      {bulkArchiveConfirm && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-4"><section role="alertdialog" aria-modal="true" className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"><h2 className="text-sm font-extrabold text-slate-900">Move selected orders to Archive?</h2><p className="mt-1 text-xs text-slate-600">The selected orders and their buying details will be removed from active lists and can be restored later.</p><div className="mt-3 max-h-44 divide-y overflow-y-auto rounded-xl border border-slate-100">{filteredOrders.filter(order => selectedArchiveIds.includes(order.id)).map(order => <div key={order.id} className="px-3 py-2 text-[10px]"><strong>{order.orderNo}</strong> · {order.customerName || 'Walk-in Customer'} · {order.status.replace(/_/g, ' ')} · {new Date(order.createdAt).toLocaleDateString('en-PH')}<div className="mt-0.5 text-slate-500">{(orderItems || []).filter(item => item.orderId === order.id).map(item => `${item.qty} ${item.unit} × ${item.productName}`).join(' · ')}</div></div>)}</div><p className="mt-3 rounded-xl bg-amber-50 p-3 text-[11px] text-amber-950">Are you sure you want to archive these orders? You can restore them whenever needed.</p><div className="mt-4 flex justify-end gap-2"><button onClick={() => setBulkArchiveConfirm(false)} disabled={archiving} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600">Cancel</button><button onClick={() => void handleBulkArchive()} disabled={archiving} className="rounded-xl bg-[#C90052] px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{archiving ? 'Moving…' : 'Move to Archive'}</button></div></section></div>}
      {removeItemTarget && <SimpleConfirm title="Remove item?" actionLabel="Remove item" description={<>Remove <strong>{removeItemTarget.productName}</strong> from this order? Its history will remain and the order total will recalculate.</>} onCancel={() => setRemoveItemTarget(null)} onConfirm={() => { const item = removeItemTarget; setRemoveItemTarget(null); void handleRemoveUnavailable(item); }} />}
      {invoiceOrder && <OrderInvoiceModal order={invoiceOrder} onClose={() => setInvoiceOrder(null)} />}
    </div>
  );
};

const SimpleConfirm: React.FC<{ title: string; actionLabel: string; description: React.ReactNode; onCancel: () => void; onConfirm: () => void }> = ({ title, actionLabel, description, onCancel, onConfirm }) => <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4"><section role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><h2 className="text-sm font-extrabold text-slate-900">{title}</h2><p className="mt-2 text-xs leading-relaxed text-slate-600">{description}</p><div className="mt-5 flex justify-end gap-2"><button onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600">Cancel</button><button onClick={onConfirm} className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white">{actionLabel}</button></div></section></div>;

const formatItemStatus = (rawStatus: string): string => {
  if (!rawStatus) return '';
  switch (rawStatus) {
    case 'UNAVAILABLE': return 'NOT AVAILABLE';
    case 'AVAILABLE_AGAIN': return 'AVAILABLE AGAIN';
    case 'ALTERNATIVE_SELECTED': return 'ALT. CHOSEN';
    case 'BOUGHT_FROM_STOCK': return 'BOUGHT / ON HAND';
    case 'PURCHASED': return 'BOUGHT';
    case 'REORDER': return 'REORDER';
    case 'PENDING': return 'PENDING';
    case 'CANCELLED': return 'CANCELLED';
    default: return rawStatus.replace(/_/g, ' ');
  }
};

const OrderInvoiceModal: React.FC<{ order: Order; onClose: () => void }> = ({ order, onClose }) => {
  const { businessInfo } = useApp();
  const summary = calculateOrderSummary(order);
  const items = order.items || [];
  const fmt = (amount: number) => `₱${roundMoney(amount).toFixed(2)}`;
  const ready = ['BOUGHT', 'COMPLETED'].includes(order.status);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-3 sm:p-5 backdrop-blur-sm">
      <div className="flex max-h-[96vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3 print:hidden">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Order Invoice</h2>
            <p className="text-xs text-slate-600">Print-ready invoice based on your Excel template</p>
          </div>
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200">
            Close
          </button>
        </div>
        <div className="overflow-y-auto p-4 sm:p-6">
          <article id="printable-invoice" className="mx-auto w-full max-w-4xl bg-white px-2 py-1 text-slate-950">
            {/* Header section with balanced 3-column layout */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
              <div className="text-left text-[10px] leading-relaxed">
                <p className="font-black uppercase text-slate-950 leading-tight">
                  {businessInfo.address || 'San Angel, San Jose de Buenavista, Antique 5700'}
                </p>
                <p className="mt-1.5 font-medium text-slate-700">MOBILE NO.: <strong className="font-bold text-slate-950">{businessInfo.phone || '09054853573'}</strong></p>
                {businessInfo.email && <p className="font-medium text-slate-700">EMAIL: <span className="underline text-slate-950">{businessInfo.email}</span></p>}
              </div>

              <div className="flex flex-col items-center text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-800">
                  {ready ? 'ITEMS ARE NOW READY FOR PICK-UP/DELIVERY!' : 'PASABUY ORDER INVOICE'}
                </p>
                <p className="mt-0.5 text-sm font-black tracking-[0.16em] text-slate-950">{businessInfo.tagline || 'YOUR SHOPPER'}</p>
                <img src={SHOPPER_LOGO_DATA_URL} alt="Your Shopper" className="mt-1 h-[88px] w-[260px] object-cover" />
              </div>

              <div className="flex flex-col items-end text-right">
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-700">INVOICE NO:</span>
                  <strong className="text-sm font-black text-slate-950">{order.orderNo}</strong>
                </div>
                <div className="mt-1 flex items-baseline gap-2 text-[10px]">
                  <span className="font-semibold text-slate-600">INVOICE DATE:</span>
                  <strong className="text-slate-900">
                    {new Date(order.createdAt).toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase()}
                  </strong>
                </div>
              </div>
            </div>

            {/* Customer Details Banner */}
            <div className="my-3 border-y border-slate-300 py-1.5 text-center">
              <h1 className="text-base font-black uppercase tracking-wide text-slate-950">
                {order.customerName || 'Walk-in Customer'}
              </h1>
              <div className="mt-0.5 flex flex-wrap items-center justify-center gap-x-3 text-[10px] text-slate-700">
                {order.customerPhone && (
                  <>
                    <span className="font-semibold text-slate-950">{order.customerPhone}</span>
                    <span className="text-slate-400">•</span>
                  </>
                )}
                <span>{order.deliveryType === 'DELIVERY' ? (order.address || 'Delivery Address Provided') : 'STORE PICKUP'}</span>
                {order.addressNote && (
                  <>
                    <span className="text-slate-400">•</span>
                    <span>Landmark: <strong className="font-semibold text-slate-900">{order.addressNote}</strong></span>
                  </>
                )}
              </div>
            </div>

            {/* Structured Grid Table with Explicit Cell Borders & Balanced Column Allocation */}
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse border border-black text-left text-[10px]">
                <colgroup>
                  <col className="w-[13%]" />
                  <col className="w-[14%]" />
                  <col className="w-[27%]" />
                  <col className="w-[9%]" />
                  <col className="w-[5%]" />
                  <col className="w-[8%]" />
                  <col className="w-[8%]" />
                  <col className="w-[7%]" />
                  <col className="w-[9%]" />
                </colgroup>
                <thead>
                  <tr className="bg-[#ff0066] text-center font-black uppercase text-black">
                    {['Name of Client', 'Bought / Not Available', 'Items', 'Price', 'Qty', 'Amount', 'Sub-total', 'Pasabuy Fee', 'Total Bill'].map(label => (
                      <th key={label} className="border border-black px-1.5 py-1.5 text-[9px] font-black uppercase leading-tight tracking-tight">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="border border-black p-5 text-center font-medium text-slate-500">
                        No items on this order.
                      </td>
                    </tr>
                  ) : (
                    items.map((item, index) => {
                      const price = item.actualPrice ?? item.estimatedPrice;
                      const status = formatItemStatus(item.status);
                      const isLast = index === items.length - 1;
                      return (
                        <tr key={item.id} className="align-middle">
                          <td className="border border-black px-2 py-1.5 leading-tight">
                            {index === 0 && (
                              <div>
                                <span className="block text-[8.5px] font-medium text-slate-500">{order.orderNo}</span>
                                <span className="font-bold text-slate-950">{order.customerName || 'Walk-in'}</span>
                              </div>
                            )}
                          </td>
                          <td className="border border-black px-2 py-1.5 text-center text-[9px] font-bold uppercase leading-tight tracking-tight break-words">
                            {status}
                          </td>
                          <td className="border border-black px-2 py-1.5 uppercase leading-tight break-words">
                            <span className="font-semibold text-slate-950">{item.productName}</span>
                            {item.notes && (
                              <small className="mt-0.5 block normal-case text-[9px] text-slate-600">Note: {item.notes}</small>
                            )}
                          </td>
                          <td className="border border-black px-2 py-1.5 text-right font-medium">{fmt(price)}</td>
                          <td className="border border-black px-1 py-1.5 text-center font-bold">{item.qty}</td>
                          <td className="border border-black px-2 py-1.5 text-right font-semibold">{fmt(price * item.qty)}</td>
                          <td className="border border-black px-2 py-1.5 text-right font-bold bg-slate-50/50">
                            {isLast ? fmt(summary.subtotal) : ''}
                          </td>
                          <td className="border border-black px-2 py-1.5 text-right font-bold bg-slate-50/50">
                            {isLast ? fmt(summary.fee) : ''}
                          </td>
                          <td className="border border-black px-2 py-1.5 text-right font-black text-slate-950 bg-slate-100/70">
                            {isLast ? fmt(summary.grandTotal) : ''}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Bottom Details Footer */}
            <div className="mt-3 rounded-lg border border-slate-300 bg-slate-50/90 p-2.5 text-[10px]">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 leading-relaxed">
                <div>
                  <span className="block text-[9px] font-bold uppercase text-slate-500">Delivery Option</span>
                  <strong className="text-slate-900">
                    {order.deliveryType === 'DELIVERY'
                      ? (order.deliveryTime === 'ASAP' || !order.deliveryTime ? 'ASAP Delivery' : `Scheduled: ${order.deliveryTime}`)
                      : 'Store Pickup'}
                  </strong>
                </div>
                <div>
                  <span className="block text-[9px] font-bold uppercase text-slate-500">Rider / Delivery Fee</span>
                  <strong className="text-slate-900">{fmt(summary.delivery)}</strong>
                  {summary.discount > 0 && (
                    <span className="block text-[9px] font-semibold text-emerald-700">Discount: −{fmt(summary.discount)}</span>
                  )}
                </div>
                <div>
                  <span className="block text-[9px] font-bold uppercase text-slate-500">Payment</span>
                  <strong className="text-slate-900">{order.paymentMethod || 'To be confirmed'}</strong>
                  {order.changeFor ? (
                    <span className="block text-[9px] text-slate-600">Change for {fmt(order.changeFor)}</span>
                  ) : null}
                </div>
                <div>
                  <span className="block text-[9px] font-bold uppercase text-slate-500">Payment Balance</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-600">Paid: {fmt(summary.paid)}</span>
                    <strong className="font-extrabold text-slate-950">Balance: {fmt(summary.balance)}</strong>
                  </div>
                </div>
              </div>
              {order.notes && (
                <div className="mt-2 border-t border-slate-200 pt-1.5 text-[10px]">
                  <strong className="font-bold text-slate-700">Order note:</strong>{' '}
                  <span className="text-slate-900">{order.notes}</span>
                </div>
              )}
            </div>
          </article>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 print:hidden">
          <button onClick={onClose} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            Close
          </button>
          <button onClick={() => window.print()} className="rounded-xl bg-[#C90052] px-4 py-2 text-xs font-bold text-white hover:bg-[#E60063]">
            Print Invoice
          </button>
        </div>
      </div>
    </div>
  );
};
