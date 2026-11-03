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
  ClipboardList,
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
    <div className="dashboard-view space-y-4 sm:space-y-5">
      {/* Welcome Banner */}
      <div className="dashboard-hero relative min-h-[164px] overflow-hidden rounded-[18px] p-4 text-white sm:min-h-[180px] sm:p-5 lg:min-h-[190px] lg:p-5">
        <div className="relative z-10 max-w-[72%]">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-[#b90056]/55 px-2.5 py-1.5 text-[10px] font-semibold text-white shadow-sm mb-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15"><ShoppingBag className="h-3.5 w-3.5" /></span>
            Antique Pasabuy POS & Delivery
          </span>
          <h2 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-[30px] lg:text-[34px]">
            Welcome to Antique Pasabuy POS
          </h2>
          <p className="mt-1.5 max-w-3xl text-xs leading-5 text-pink-50 sm:text-sm">
            Manage customer orders, track buying lists, and monitor daily sales.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => setActiveView('new-order')}
              className="flex min-h-9 items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-bold text-[#C90052] shadow-sm transition-colors hover:bg-pink-50 active:scale-[0.98]"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create New Order</span>
            </button>
            <button
              onClick={() => setActiveView('buying-list')}
              className="flex min-h-9 items-center gap-1.5 rounded-full border border-white/30 bg-white/10 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-white/20 active:scale-[0.98]"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Open Buying List ({pendingItemsCount})</span>
            </button>
          </div>
        </div>

        <div className="dashboard-hero-art pointer-events-none absolute inset-y-0 right-0 flex w-[42%] items-center justify-center overflow-hidden text-white" aria-hidden="true">
          <div className="dashboard-hero-wave absolute inset-y-0 left-0 w-full" />
          <div className="dashboard-bag relative z-10 flex h-28 w-24 items-center justify-center rounded-[1.25rem] border border-white/50 sm:h-32 sm:w-28 lg:h-36 lg:w-32">
            <div className="dashboard-bag-handle absolute -top-7 h-14 w-20 rounded-t-full border-[9px] border-b-0 border-white/70 sm:-top-8 sm:h-16 sm:w-24" />
            <ShoppingBag className="h-14 w-14 stroke-[1.15] sm:h-16 sm:w-16" />
            <span className="absolute right-5 top-6 h-2.5 w-2.5 rounded-full bg-white/90" />
            <span className="absolute right-2 top-10 h-2 w-2 rounded-full bg-white/80" />
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3 xl:grid-cols-4">
        {/* Items to Buy */}
        <div
          onClick={() => setActiveView('buying-list')}
          className="dashboard-metric dashboard-metric-buy group min-h-[120px] cursor-pointer rounded-[18px] border bg-white p-3.5 transition-all hover:-translate-y-0.5 hover:shadow-md sm:p-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 sm:text-sm">Items to Buy</span>
            <div className="rounded-full bg-pink-100 p-2 text-pink-600 transition-transform group-hover:scale-105">
              <ShoppingCart className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold tracking-tight text-[#292344]">{pendingItemsCount}</span>
            <span className="text-xs font-bold text-amber-600">Pending</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Click to start shopping run</p>
        </div>

        {/* Orders Waiting */}
        <div
          onClick={() => setActiveView('orders')}
          className="dashboard-metric dashboard-metric-wait group min-h-[120px] cursor-pointer rounded-[18px] border bg-white p-3.5 transition-all hover:-translate-y-0.5 hover:shadow-md sm:p-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 sm:text-sm">Orders Waiting</span>
            <div className="rounded-full bg-pink-100 p-2 text-pink-600 transition-transform group-hover:scale-105">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold tracking-tight text-[#292344]">{ordersWaitingToBuy}</span>
            <span className="text-xs font-bold text-blue-600">POs</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">{activeOrdersCount} active orders in total</p>
        </div>

        {/* Outstanding Balance */}
        <div className="dashboard-metric dashboard-metric-balance min-h-[120px] rounded-[18px] border bg-white p-3.5 sm:p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 sm:text-sm">Uncollected Balance</span>
            <div className="rounded-full bg-pink-100 p-2 text-pink-600">
              <AlertCircle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-xl font-extrabold tracking-tight text-[#d81463] sm:text-2xl">
              ₱{outstandingBalance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Receivable from active clients</p>
        </div>

        {/* Total Completed Volume */}
        <div className="dashboard-metric dashboard-metric-delivered min-h-[120px] rounded-[18px] border bg-white p-3.5 sm:p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 sm:text-sm">Delivered Volume</span>
            <div className="rounded-full bg-emerald-100 p-2 text-emerald-600">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-xl font-extrabold tracking-tight text-emerald-700 sm:text-2xl">
              ₱{totalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Total completed orders value</p>
        </div>
      </div>

      {/* Recent Orders Table */}
      <div className="dashboard-orders overflow-hidden rounded-[20px] border border-pink-100 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5 sm:py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#d90d68] text-white shadow-sm"><ClipboardList className="h-4 w-4" /></span>
            <div>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base">Recent Purchase Orders</h3>
              <p className="text-[11px] text-slate-500 sm:text-xs">Latest Pasabuy orders and customer requests</p>
            </div>
          </div>
          <button
            onClick={() => setActiveView('orders')}
            className="flex min-h-8 shrink-0 items-center gap-1.5 rounded-full bg-[#e90b70] px-3.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#c90052]"
          >
            <span>View All</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className="bg-[#fde5f0] text-[11px] font-bold text-[#604b68] uppercase tracking-wider border-b border-pink-100">
              <tr>
                <th className="px-4 py-2.5">Order #</th>
                <th className="px-4 py-2.5">Customer</th>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5 text-center">Action</th>
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
                    <tr key={order.id} className="transition-colors hover:bg-pink-50/40">
                      <td className="px-5 py-3.5 font-bold text-[#201b39]">
                        {order.orderNo}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-[#201b39]">{order.customerName}</div>
                        <div className="text-[10px] text-slate-400">{order.customerPhone}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="rounded-full bg-pink-100 px-3 py-1 text-[10px] font-bold text-pink-700">
                          {order.deliveryType}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${order.status === 'COMPLETED'
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
                            className="p-1.5 text-slate-500 hover:text-pink-700 hover:bg-pink-50 rounded-lg"
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
