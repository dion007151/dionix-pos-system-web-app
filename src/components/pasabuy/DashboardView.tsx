import React from 'react';
import { useApp } from '../../context/AppContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import {
  ShoppingCart,
  Clock,
  PackageCheck,
  AlertCircle,
  PlusCircle,
  ShoppingBag,
  TrendingUp,
  ArrowRight,
  Eye,
  Printer
} from 'lucide-react';
import { calculateOrderSummary } from '../../services/calc';

export const DashboardView: React.FC = () => {
  const { setActiveView, openReceiptModal } = useApp();

  const orders = useLiveQuery(async () => {
    return await db.orders.orderBy('createdAt').reverse().toArray();
  }, []);

  const orderItems = useLiveQuery(async () => {
    return await db.orderItems.toArray();
  }, []);

  const paymentsList = useLiveQuery(async () => {
    return await db.payments.toArray();
  }, []);

  const rateTiers = useLiveQuery(async () => {
    return await db.rateTiers.toArray();
  }, []);

  // Compute Metrics faithfully matching Calc.cs
  const nonCancelledOrders = (orders || []).filter(o => o.status !== 'CANCELLED');

  const pendingItemsCount = (orderItems || []).filter(
    i => i.status === 'PENDING' && i.productName && i.productName.trim() !== '-'
  ).length;

  const ordersWaitingToBuy = nonCancelledOrders.filter(o => {
    const items = (orderItems || []).filter(i => i.orderId === o.id);
    return items.some(i => i.status === 'PENDING' && i.productName && i.productName.trim() !== '-');
  }).length;

  const activeOrdersCount = nonCancelledOrders.filter(
    o => o.status !== 'COMPLETED'
  ).length;

  let outstandingBalance = 0;
  let totalRevenue = 0;

  for (const o of nonCancelledOrders) {
    const items = (orderItems || []).filter(i => i.orderId === o.id);
    const orderPayments = (paymentsList || []).filter(p => p.orderId === o.id);
    const summary = calculateOrderSummary({ ...o, items, payments: orderPayments }, rateTiers);
    outstandingBalance += summary.balance;
    if (o.status === 'COMPLETED') {
      totalRevenue += summary.grandTotal;
    }
  }

  const recentOrders = (orders || []).slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#452B86] to-[#5B43E8] p-6 text-white shadow-md">
        <div className="relative z-10 max-w-xl">
          <span className="inline-block px-3 py-1 text-xs font-semibold rounded-full bg-white/20 text-purple-100 backdrop-blur-xs mb-2">
            Antique Pasabuy POS & Delivery
          </span>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight">
            Welcome to DIONIX POS
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-purple-100">
            Smart local-first shopping list, accurate tiered fee calculation, and real-time order tracking.
          </p>

          <div className="flex flex-wrap gap-2.5 mt-4">
            <button
              onClick={() => setActiveView('new-order')}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-[#452B86] bg-white rounded-xl shadow-xs hover:bg-purple-50 transition-all active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create New Order</span>
            </button>
            <button
              onClick={() => setActiveView('buying-list')}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-white/20 rounded-xl hover:bg-white/30 backdrop-blur-xs transition-all active:scale-95"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Open Buying List ({pendingItemsCount})</span>
            </button>
          </div>
        </div>

        <div className="absolute right-0 top-0 bottom-0 opacity-10 flex items-center pr-8 pointer-events-none">
          <ShoppingBag className="w-64 h-64 text-white" />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Items to Buy */}
        <div
          onClick={() => setActiveView('buying-list')}
          className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs hover:border-purple-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Items to Buy</span>
            <div className="p-2 bg-amber-50 rounded-xl text-amber-600 group-hover:scale-110 transition-transform">
              <ShoppingCart className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{pendingItemsCount}</span>
            <span className="text-[11px] font-semibold text-amber-600">Pending</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Click to start shopping run</p>
        </div>

        {/* Orders Waiting */}
        <div
          onClick={() => setActiveView('orders')}
          className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs hover:border-purple-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Orders Waiting</span>
            <div className="p-2 bg-blue-50 rounded-xl text-blue-600 group-hover:scale-110 transition-transform">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900">{ordersWaitingToBuy}</span>
            <span className="text-[11px] font-semibold text-blue-600">POs</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">{activeOrdersCount} active orders in total</p>
        </div>

        {/* Outstanding Balance */}
        <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Uncollected Balance</span>
            <div className="p-2 bg-rose-50 rounded-xl text-rose-600">
              <AlertCircle className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-rose-600">
              ₱{outstandingBalance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Receivable from active clients</p>
        </div>

        {/* Total Completed Volume */}
        <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Delivered Volume</span>
            <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-emerald-700">
              ₱{totalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Total completed orders value</p>
        </div>
      </div>

      {/* Recent Orders Table */}
      <div className="overflow-hidden bg-white border border-slate-200/80 rounded-2xl shadow-xs">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Recent Purchase Orders</h3>
            <p className="text-xs text-slate-500">Latest Pasabuy orders and customer requests</p>
          </div>
          <button
            onClick={() => setActiveView('orders')}
            className="flex items-center gap-1 text-xs font-bold text-[#452B86] hover:text-[#5B43E8]"
          >
            <span>View All</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/75 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100">
              <tr>
                <th className="px-5 py-3">Order #</th>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Total</th>
                <th className="px-5 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {recentOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                    No orders created yet. Click "Create New Order" to start!
                  </td>
                </tr>
              ) : (
                recentOrders.map(order => {
                  const items = (orderItems || []).filter(i => i.orderId === order.id);
                  const summary = calculateOrderSummary({ ...order, items }, rateTiers);

                  return (
                    <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3.5 font-bold text-slate-900">
                        {order.orderNo}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-800">{order.customerName}</div>
                        <div className="text-[10px] text-slate-400">{order.customerPhone}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                          {order.deliveryType}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            order.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : order.status === 'READY_TO_BUY' || order.status === 'WAITING_CONFIRMATION'
                              ? 'bg-amber-100 text-amber-800'
                              : order.status === 'BUYING_NOW'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {order.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-black text-slate-900">
                        ₱{summary.grandTotal.toFixed(2)}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => openReceiptModal({ order: { ...order, items } })}
                            className="p-1.5 text-slate-500 hover:text-purple-700 hover:bg-purple-50 rounded-lg"
                            title="Print Receipt"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setActiveView('orders')}
                            className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
