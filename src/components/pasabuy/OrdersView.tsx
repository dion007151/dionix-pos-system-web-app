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
  AlertCircle
} from 'lucide-react';
import { Order, OrderStatus, PaymentMethod } from '../../types';
import {
  calculateOrderSummary,
  roundMoney
} from '../../services/calc';

export const OrdersView: React.FC = () => {
  const { openReceiptModal, addToast } = useApp();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStatusTab, setSelectedStatusTab] = useState<OrderStatus | 'ALL'>('ALL');

  // Selected Order for View Drawer or Payment Modal
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [paymentReference, setPaymentReference] = useState<string>('');

  const orders = useLiveQuery(() => db.orders.orderBy('createdAt').reverse().toArray(), []);
  const orderItems = useLiveQuery(() => db.orderItems.toArray(), []);
  const payments = useLiveQuery(() => db.payments.toArray(), []);
  const rateTiers = useLiveQuery(() => db.rateTiers.toArray(), []);

  // Filter Orders
  const filteredOrders = (orders || []).filter(order => {
    const matchesTab = selectedStatusTab === 'ALL' || order.status === selectedStatusTab;
    const matchesSearch =
      !searchQuery ||
      order.orderNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.customerName && order.customerName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (order.customerPhone && order.customerPhone.includes(searchQuery));

    return matchesTab && matchesSearch;
  });

  // Handle Mark Completed
  const handleMarkCompleted = async (order: Order) => {
    await db.orders.update(order.id, {
      status: 'COMPLETED',
      updatedAt: new Date().toISOString()
    });
    addToast(`Order ${order.orderNo} marked as Completed!`, 'success');
  };

  // Handle Cancel Order
  const handleCancelOrder = async (order: Order) => {
    if (!confirm(`Are you sure you want to cancel ${order.orderNo}?`)) return;
    await db.orders.update(order.id, {
      status: 'CANCELLED',
      updatedAt: new Date().toISOString()
    });
    addToast(`Order ${order.orderNo} cancelled`, 'info');
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
    addToast(`Payment of ₱${newPayment.amount.toFixed(2)} recorded via ${paymentMethod}`, 'success');
    setShowPaymentModal(false);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-purple-700" />
            <span>Purchase Orders Directory</span>
          </h2>
          <p className="text-xs text-slate-500">
            Track order fulfillment status, customer balances, payments, and print receipts.
          </p>
        </div>
      </div>

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
                ? orders?.length || 0
                : orders?.filter(o => o.status === tab.id).length || 0;

            return (
              <button
                key={tab.id}
                onClick={() => setSelectedStatusTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl whitespace-nowrap transition-all ${
                  isSelected
                    ? 'bg-[#452B86] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    isSelected ? 'bg-white text-purple-900' : 'bg-slate-200 text-slate-700'
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
        {filteredOrders.length === 0 ? (
          <div className="p-8 text-center bg-white border border-slate-200/80 rounded-2xl">
            <Package className="w-10 h-10 text-slate-400 mx-auto mb-2 opacity-50" />
            <h3 className="font-bold text-slate-800 text-sm">No orders matching criteria</h3>
            <p className="text-xs text-slate-500 mt-1">Try resetting the filter tabs or search query.</p>
          </div>
        ) : (
          filteredOrders.map(order => {
            const items = (orderItems || []).filter(i => i.orderId === order.id);
            const orderPayments = (payments || []).filter(p => p.orderId === order.id);
            const summary = calculateOrderSummary(
              { ...order, items, payments: orderPayments },
              rateTiers
            );

            const boughtCount = items.filter(
              i => i.status === 'PURCHASED' || i.status === 'BOUGHT_FROM_STOCK'
            ).length;

            return (
              <div
                key={order.id}
                className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs hover:border-purple-200 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* Left: Customer & Details */}
                <div className="flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-black text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded-md">
                      {order.orderNo}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        order.status === 'COMPLETED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : order.status === 'READY_TO_BUY' || order.status === 'WAITING_CONFIRMATION'
                          ? 'bg-amber-100 text-amber-800'
                          : order.status === 'BUYING_NOW'
                          ? 'bg-blue-100 text-blue-800'
                          : order.status === 'BOUGHT'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {order.status.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                      {order.deliveryType === 'DELIVERY' ? (
                        <Truck className="w-3.5 h-3.5 text-purple-600" />
                      ) : (
                        <Building2 className="w-3.5 h-3.5 text-slate-600" />
                      )}
                      <span>{order.deliveryType}</span>
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                        summary.paymentStatus === 'PAID'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : summary.paymentStatus === 'PARTIAL'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}
                    >
                      {summary.paymentStatus}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2">
                    <h3 className="text-sm font-bold text-slate-900">{order.customerName}</h3>
                    {order.customerPhone && (
                      <span className="text-xs text-slate-500 font-mono">
                        ({order.customerPhone})
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-500">
                    {items.length} items ({boughtCount} bought) · Fee: ₱{summary.fee.toFixed(2)}
                    {order.address && ` · ${order.address}`}
                  </p>
                </div>

                {/* Middle: Financials */}
                <div className="flex items-center gap-4 bg-slate-50/80 px-4 py-2.5 rounded-xl border border-slate-100 text-xs self-start md:self-auto">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Total</span>
                    <span className="text-sm font-black text-slate-900">
                      ₱{summary.grandTotal.toFixed(2)}
                    </span>
                  </div>
                  <div className="w-px h-6 bg-slate-200" />
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Paid</span>
                    <span className="text-xs font-bold text-emerald-700">
                      ₱{summary.paid.toFixed(2)}
                    </span>
                  </div>
                  <div className="w-px h-6 bg-slate-200" />
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Balance</span>
                    <span
                      className={`text-xs font-bold ${
                        summary.balance > 0 ? 'text-rose-600' : 'text-slate-400'
                      }`}
                    >
                      ₱{summary.balance.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex flex-wrap items-center gap-1.5 self-end md:self-auto">
                  <button
                    onClick={() => handleOpenPayment(order)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl transition-all"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Pay</span>
                  </button>

                  <button
                    onClick={() =>
                      openReceiptModal({
                        order: { ...order, items, payments: orderPayments }
                      })
                    }
                    className="p-2 text-slate-500 hover:text-purple-700 hover:bg-purple-50 rounded-xl transition-all"
                    title="Print Thermal Receipt"
                  >
                    <Printer className="w-4 h-4" />
                  </button>

                  {order.status !== 'COMPLETED' && order.status !== 'CANCELLED' && (
                    <button
                      onClick={() => handleMarkCompleted(order)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-all active:scale-95"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Complete</span>
                    </button>
                  )}

                  {order.status !== 'CANCELLED' && order.status !== 'COMPLETED' && (
                    <button
                      onClick={() => handleCancelOrder(order)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl"
                      title="Cancel Order"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Payment Recording Modal */}
      {showPaymentModal && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5 border border-slate-200 space-y-4">
            <div>
              <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider">
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
                className="flex-1 py-2 text-xs font-bold text-white bg-[#452B86] rounded-xl hover:bg-[#5B43E8] shadow-xs"
              >
                Save Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
