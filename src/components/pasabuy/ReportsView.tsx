import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import {
  BarChart3,
  Download,
  Calendar,
  DollarSign,
  TrendingUp,
  Receipt,
  Store as StoreIcon,
  ShoppingBag
} from 'lucide-react';
import {
  calculateOrderSummary,
  roundMoney
} from '../../services/calc';

export const ReportsView: React.FC = () => {
  const [dateFilter, setDateFilter] = useState<'TODAY' | 'WEEK' | 'MONTH' | 'ALL'>('ALL');

  const orders = useLiveQuery(() => db.orders.toArray(), []);
  const orderItems = useLiveQuery(() => db.orderItems.toArray(), []);
  const expenses = useLiveQuery(() => db.expenses.toArray(), []);
  const rateTiers = useLiveQuery(() => db.rateTiers.toArray(), []);

  // Filter based on Date
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const getFilteredOrders = () => {
    if (!orders) return [];
    return orders.filter(o => {
      if (o.status === 'CANCELLED') return false;
      if (dateFilter === 'ALL') return true;

      const orderDate = new Date(o.createdAt);
      if (dateFilter === 'TODAY') {
        return o.createdAt.startsWith(todayStr);
      }
      if (dateFilter === 'WEEK') {
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return orderDate >= oneWeekAgo;
      }
      if (dateFilter === 'MONTH') {
        return (
          orderDate.getMonth() === now.getMonth() &&
          orderDate.getFullYear() === now.getFullYear()
        );
      }
      return true;
    });
  };

  const getFilteredExpenses = () => {
    if (!expenses) return [];
    return expenses.filter(e => {
      if (dateFilter === 'ALL') return true;
      if (dateFilter === 'TODAY') {
        return e.expenseDate === todayStr;
      }
      const expDate = new Date(e.expenseDate);
      if (dateFilter === 'WEEK') {
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return expDate >= oneWeekAgo;
      }
      if (dateFilter === 'MONTH') {
        return (
          expDate.getMonth() === now.getMonth() &&
          expDate.getFullYear() === now.getFullYear()
        );
      }
      return true;
    });
  };

  const currentOrders = getFilteredOrders();
  const currentExpenses = getFilteredExpenses();

  // Metrics
  let grossPurchaseVolume = 0;
  let totalPasabuyFees = 0;

  for (const o of currentOrders) {
    const items = (orderItems || []).filter(i => i.orderId === o.id);
    const summary = calculateOrderSummary({ ...o, items }, rateTiers);
    grossPurchaseVolume += summary.subtotal;
    totalPasabuyFees += summary.fee;
  }

  const totalExpenseAmount = currentExpenses.reduce((sum, e) => sum + e.amount, 0);
  const netIncome = totalPasabuyFees - totalExpenseAmount;

  // Breakdown by Store
  const storeVolume: { [key: string]: { count: number; subtotal: number } } = {};
  for (const o of currentOrders) {
    const items = (orderItems || []).filter(i => i.orderId === o.id);
    for (const item of items) {
      const sName = item.storeName || 'Other Stores';
      if (!storeVolume[sName]) {
        storeVolume[sName] = { count: 0, subtotal: 0 };
      }
      const price = item.actualPrice !== undefined ? item.actualPrice : item.estimatedPrice;
      storeVolume[sName].count += 1;
      storeVolume[sName].subtotal += item.qty * price;
    }
  }

  // Export to CSV
  const handleExportCsv = () => {
    let csv = 'Order No,Customer,Type,Status,Subtotal,Pasabuy Fee,Delivery Fee,Total,Date\n';
    for (const o of currentOrders) {
      const items = (orderItems || []).filter(i => i.orderId === o.id);
      const s = calculateOrderSummary({ ...o, items }, rateTiers);
      csv += `"${o.orderNo}","${o.customerName || ''}","${o.deliveryType}","${o.status}",${s.subtotal.toFixed(2)},${s.fee.toFixed(2)},${s.delivery.toFixed(2)},${s.grandTotal.toFixed(2)},"${o.createdAt}"\n`;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `antique_pasabuy_report_${dateFilter.toLowerCase()}_${todayStr}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-purple-700" />
            <span>Financial & Sales Reports</span>
          </h2>
          <p className="text-xs text-slate-500">
            Net Pasabuy earnings, shopping turnover, and store expenditure in Antique.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Date Range Tabs */}
          <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs font-semibold">
            {[
              { id: 'TODAY', label: 'Today' },
              { id: 'WEEK', label: '7 Days' },
              { id: 'MONTH', label: 'Month' },
              { id: 'ALL', label: 'All Time' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setDateFilter(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  dateFilter === tab.id
                    ? 'bg-white text-purple-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-[#452B86] bg-white border border-purple-200 hover:bg-purple-50 rounded-xl shadow-xs transition-all active:scale-95"
            title="Download CSV / Excel spreadsheet"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        </div>
      </div>

      {/* Financial Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Gross Purchase Volume */}
        <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs">
          <span className="text-xs font-semibold text-slate-500">Gross Shopping Volume</span>
          <div className="mt-1 text-2xl font-black text-slate-900">
            ₱{grossPurchaseVolume.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Total items bought across {currentOrders.length} orders
          </p>
        </div>

        {/* Pasabuy Fee Revenue */}
        <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs">
          <span className="text-xs font-semibold text-slate-500">Pasabuy Fee Revenue</span>
          <div className="mt-1 text-2xl font-black text-purple-700">
            ₱{totalPasabuyFees.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Gross service fee earnings</p>
        </div>

        {/* Total Expenses */}
        <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs">
          <span className="text-xs font-semibold text-slate-500">Operating Expenses</span>
          <div className="mt-1 text-2xl font-black text-rose-600">
            ₱{totalExpenseAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Fuel, supplies & transport ({currentExpenses.length} entries)
          </p>
        </div>

        {/* Net Profit */}
        <div
          className={`p-4 border rounded-2xl shadow-xs ${
            netIncome >= 0
              ? 'bg-emerald-50/40 border-emerald-200'
              : 'bg-rose-50/40 border-rose-200'
          }`}
        >
          <span className="text-xs font-semibold text-slate-600">Net Pasabuy Profit</span>
          <div
            className={`mt-1 text-2xl font-black ${
              netIncome >= 0 ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            ₱{netIncome.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Fee revenue minus expenses</p>
        </div>
      </div>

      {/* Store Breakdown Table */}
      <div className="overflow-hidden bg-white border border-slate-200/80 rounded-2xl shadow-xs">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 text-sm">Shopping Turnover by Store</h3>
          <p className="text-xs text-slate-500">
            Volume of pasabuy orders fulfilled at malls, pharmacies, and groceries
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/75 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100">
              <tr>
                <th className="px-5 py-3">Store Name</th>
                <th className="px-5 py-3 text-center">Items Handled</th>
                <th className="px-5 py-3 text-right">Turnover (₱)</th>
                <th className="px-5 py-3 text-right">% of Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {Object.keys(storeVolume).length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-slate-400">
                    No orders or shopping data recorded for this time range.
                  </td>
                </tr>
              ) : (
                Object.entries(storeVolume).map(([storeName, data]) => {
                  const share =
                    grossPurchaseVolume > 0
                      ? (data.subtotal / grossPurchaseVolume) * 100
                      : 0;

                  return (
                    <tr key={storeName} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3.5 font-bold text-slate-900 flex items-center gap-2">
                        <StoreIcon className="w-4 h-4 text-purple-700" />
                        <span>{storeName}</span>
                      </td>
                      <td className="px-5 py-3.5 text-center font-semibold text-slate-700">
                        {data.count} items
                      </td>
                      <td className="px-5 py-3.5 text-right font-black text-slate-900">
                        ₱{data.subtotal.toFixed(2)}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-500">
                        {share.toFixed(1)}%
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
