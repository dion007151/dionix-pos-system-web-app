import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import {
  BarChart3, Download, Calendar, DollarSign, TrendingUp, Receipt,
  Search, ShoppingBag, CreditCard, Wallet
} from 'lucide-react';
import { calculateOrderSummary } from '../../services/calc';
import { Expense, Order, OrderItem, Payment } from '../../types';

type Period = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM';
type RecordType = 'ALL' | 'ORDER' | 'PAYMENT' | 'EXPENSE';
type ReportRow = { id: string; date: string; reference: string; type: Exclude<RecordType, 'ALL'>; description: string; relatedOrder: string; method: string; amount: number; status: string; searchTerms?: string };

const localDateKey = (value: string | undefined) => {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const atLocalDay = (key: string) => new Date(`${key}T00:00:00`);
const peso = (amount: number) => `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function periodRange(period: Period, fromDate: string, toDate: string, now: Date) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start = new Date(today);
  let end = new Date(today);
  if (period === 'WEEKLY') {
    start.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    end.setDate(start.getDate() + 6);
  } else if (period === 'MONTHLY') {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
    end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  } else if (period === 'YEARLY') {
    start = new Date(today.getFullYear(), 0, 1);
    end = new Date(today.getFullYear(), 11, 31);
  } else if (period === 'CUSTOM') {
    start = fromDate ? atLocalDay(fromDate) : new Date(today);
    end = toDate ? atLocalDay(toDate) : new Date(today);
    if (start > end) [start, end] = [end, start];
  }
  return { from: dateKey(start), to: dateKey(end), start, end };
}

function reportTotals(range: { from: string; to: string }, orders: Order[], items: OrderItem[], payments: Payment[], expenses: Expense[], tiers: any[]) {
  const inRange = (date: string | undefined) => {
    const key = localDateKey(date);
    return !!key && key >= range.from && key <= range.to;
  };
  const periodOrders = orders.filter(order => order.status !== 'CANCELLED' && inRange(order.createdAt));
  const sales = periodOrders.reduce((sum, order) => {
    const orderItems = items.filter(item => item.orderId === order.id);
    return sum + calculateOrderSummary({ ...order, items: orderItems }, tiers).grandTotal;
  }, 0);
  const cogs = periodOrders.reduce((sum, order) => sum + items
    .filter(item => item.orderId === order.id && item.status !== 'CANCELLED' && (item.status === 'PURCHASED' || item.status === 'BOUGHT_FROM_STOCK'))
    .reduce((itemSum, item) => itemSum + (item.purchasedQty ?? item.qty) * (item.actualPrice ?? item.estimatedPrice), 0), 0);
  const periodExpenses = expenses.filter(expense => inRange(expense.expenseDate));
  const collected = payments.filter(payment => inRange(payment.paymentDate)).reduce((sum, payment) => sum + payment.amount, 0);
  const outstanding = periodOrders.reduce((sum, order) => {
    const orderItems = items.filter(item => item.orderId === order.id);
    const orderPayments = payments.filter(payment => payment.orderId === order.id);
    return sum + calculateOrderSummary({ ...order, items: orderItems, payments: orderPayments }, tiers).balance;
  }, 0);
  const expensesTotal = periodExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const grossProfit = sales - cogs;
  return { sales, expenses: expensesTotal, cogs, grossProfit, netProfit: grossProfit - expensesTotal, outstanding, collected };
}

export const ReportsView: React.FC = () => {
  const [period, setPeriod] = useState<Period>('MONTHLY');
  const [customFrom, setCustomFrom] = useState(dateKey(new Date()));
  const [customTo, setCustomTo] = useState(dateKey(new Date()));
  const [search, setSearch] = useState('');
  const [recordType, setRecordType] = useState<RecordType>('ALL');
  const [page, setPage] = useState(1);
  const orders = useLiveQuery(() => db.orders.toArray(), []);
  const orderItems = useLiveQuery(() => db.orderItems.toArray(), []);
  const payments = useLiveQuery(() => db.payments.toArray(), []);
  const expenses = useLiveQuery(() => db.expenses.toArray(), []);
  const rateTiers = useLiveQuery(() => db.rateTiers.toArray(), []);
  const ready = !!orders && !!orderItems && !!payments && !!expenses && !!rateTiers;
  const allOrders = orders || [];
  const allItems = orderItems || [];
  const allPayments = payments || [];
  const allExpenses = expenses || [];
  const tiers = rateTiers || [];
  const today = new Date();
  const range = periodRange(period, customFrom, customTo, today);

  const currentTotals = useMemo(() => reportTotals(range, allOrders, allItems, allPayments, allExpenses, tiers), [range.from, range.to, allOrders, allItems, allPayments, allExpenses, tiers]);
  const previousRange = useMemo(() => {
    const days = Math.max(1, Math.round((atLocalDay(range.to).getTime() - atLocalDay(range.from).getTime()) / 86400000) + 1);
    const previousEnd = new Date(atLocalDay(range.from));
    previousEnd.setDate(previousEnd.getDate() - 1);
    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousStart.getDate() - days + 1);
    return { from: dateKey(previousStart), to: dateKey(previousEnd) };
  }, [range.from, range.to]);
  const previousTotals = useMemo(() => reportTotals(previousRange, allOrders, allItems, allPayments, allExpenses, tiers), [previousRange.from, previousRange.to, allOrders, allItems, allPayments, allExpenses, tiers]);
  const inRange = (value: string | undefined) => {
    const key = localDateKey(value);
    return !!key && key >= range.from && key <= range.to;
  };
  const orderById = new Map(allOrders.map(order => [order.id, order]));
  const transactions: ReportRow[] = useMemo(() => {
    const rows: ReportRow[] = [];
    for (const order of allOrders) {
      if (order.status === 'CANCELLED' || !inRange(order.createdAt)) continue;
      const rowsForOrder = allItems.filter(item => item.orderId === order.id);
      const summary = calculateOrderSummary({ ...order, items: rowsForOrder }, tiers);
      rows.push({ id: `order-${order.id}`, date: order.createdAt, reference: order.orderNo, type: 'ORDER', description: order.customerName || 'Walk-in Customer', relatedOrder: order.orderNo, method: '—', amount: summary.grandTotal, status: order.status.replace(/_/g, ' '), searchTerms: rowsForOrder.map(item => item.productName).join(' ') });
    }
    for (const payment of allPayments) {
      if (!inRange(payment.paymentDate)) continue;
      const order = orderById.get(payment.orderId);
      rows.push({ id: `payment-${payment.id}`, date: payment.paymentDate, reference: payment.referenceNo || payment.id, type: 'PAYMENT', description: order?.customerName || 'Payment received', relatedOrder: order?.orderNo || payment.orderId, method: payment.method, amount: payment.amount, status: 'RECEIVED' });
    }
    for (const expense of allExpenses) {
      if (!inRange(expense.expenseDate)) continue;
      rows.push({ id: `expense-${expense.id}`, date: expense.expenseDate, reference: expense.id, type: 'EXPENSE', description: expense.description, relatedOrder: expense.category, method: '—', amount: expense.amount, status: 'RECORDED' });
    }
    return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  // inRange uses the selected range and the database arrays are live-query backed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allOrders, allItems, allPayments, allExpenses, tiers, range.from, range.to]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return transactions.filter(row => (recordType === 'ALL' || row.type === recordType) && (!query || [row.reference, row.description, row.relatedOrder, row.method, row.status, row.searchTerms || ''].some(value => value.toLocaleLowerCase().includes(query))));
  }, [transactions, search, recordType]);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  const periodLabel = `${new Date(`${range.from}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })} – ${new Date(`${range.to}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  const summaryRows: [string, number][] = [
    ['Total Sales', currentTotals.sales], ['Total Expenses', currentTotals.expenses], ['Cost of Goods Sold', currentTotals.cogs],
    ['Gross Profit', currentTotals.grossProfit], ['Net Profit', currentTotals.netProfit],
    ['Outstanding Payments', currentTotals.outstanding], ['Collected Payments', currentTotals.collected]
  ];
  const exportCsv = () => {
    const values: unknown[][] = [
      ['Financial report', periodLabel], ['Metric', 'Amount'], ...summaryRows,
      [], ['Date & Time', 'Reference', 'Type', 'Customer / Description', 'Related Order / Category', 'Payment Method', 'Amount', 'Status'],
      ...filteredRows.map(row => [row.date, row.reference, row.type, row.description, row.relatedOrder, row.method, row.amount.toFixed(2), row.status])
    ];
    const csv = values.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    downloadFile(csv, `financial-report-${range.from}-to-${range.to}.csv`, 'text/csv;charset=utf-8');
  };
  const exportExcel = () => {
    const summary = summaryRows.map(([label, amount]) => `<tr><th>${escapeHtml(label)}</th><td>${amount.toFixed(2)}</td></tr>`).join('');
    const rows = filteredRows.map(row => `<tr><td>${escapeHtml(new Date(row.date).toLocaleString('en-PH'))}</td><td>${escapeHtml(row.reference)}</td><td>${row.type}</td><td>${escapeHtml(row.description)}</td><td>${escapeHtml(row.relatedOrder)}</td><td>${escapeHtml(row.method)}</td><td>${row.amount.toFixed(2)}</td><td>${escapeHtml(row.status)}</td></tr>`).join('');
    const html = `<html><meta charset="utf-8"><table><caption>Financial Report — ${escapeHtml(periodLabel)}</caption>${summary}</table><br><table border="1"><thead><tr><th>Date & Time</th><th>Reference</th><th>Type</th><th>Customer / Description</th><th>Related Order / Category</th><th>Payment Method</th><th>Amount</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></html>`;
    downloadFile(`\ufeff${html}`, `financial-report-${range.from}-to-${range.to}.xls`, 'application/vnd.ms-excel;charset=utf-8');
  };

  return (
    <div className="financial-report-page space-y-5">
      <style>{`@media print { body * { visibility: hidden !important; } .financial-report-print, .financial-report-print * { visibility: visible !important; } .financial-report-print { position: absolute; inset: 0; width: 100%; padding: 16px; background: white; color: #111827; } .financial-report-print table { width: 100%; border-collapse: collapse; font-size: 10px; } .financial-report-print th, .financial-report-print td { border: 1px solid #cbd5e1; padding: 5px; text-align: left; } .financial-report-print h1 { font-size: 18px; margin-bottom: 4px; } .financial-report-print .print-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0; } }`}</style>
      <div style={{ background: 'linear-gradient(115deg, #451323 0%, #6B1736 52%, #B0125B 100%)' }} className="relative overflow-hidden rounded-3xl bg-[#451323] p-5 text-white shadow-lg print:hidden sm:p-6">
        <div className="pointer-events-none absolute -right-10 -top-20 h-64 w-64 rounded-full border-[30px] border-white/5" />
        <div className="pointer-events-none absolute right-28 -bottom-24 h-48 w-48 rounded-full bg-pink-500/10 blur-2xl" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-pink-100"><BarChart3 className="h-3.5 w-3.5" /> Business overview</div>
          <h2 className="flex items-center gap-2 text-2xl font-black tracking-tight text-white">Financial Reports</h2>
          <p className="mt-1 max-w-lg text-xs text-pink-100/80">A clear view of your sales, costs, collections, and profit.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1 rounded-2xl border border-white/15 bg-black/15 p-1 text-xs font-semibold backdrop-blur-sm">
            {([['DAILY', 'Daily'], ['WEEKLY', 'Weekly'], ['MONTHLY', 'Monthly'], ['YEARLY', 'Yearly'], ['CUSTOM', 'Custom']] as [Period, string][]).map(([value, label]) => <button key={value} onClick={() => { setPeriod(value); setPage(1); }} style={period === value ? { backgroundColor: '#FFFFFF', color: '#6B1736' } : { color: 'rgba(255,255,255,0.9)' }} className={`rounded-xl px-3 py-2 font-bold transition ${period === value ? 'shadow-md' : 'hover:bg-white/10'}`}>{label}</button>)}
          </div>
          {period === 'CUSTOM' && <div className="flex items-center gap-2 rounded-2xl border border-white/20 bg-white px-3 py-2 text-slate-700 shadow-sm"><label className="text-[10px] font-bold text-slate-500">From<input aria-label="Report start date" type="date" value={customFrom} onChange={event => { setCustomFrom(event.target.value); setPage(1); }} className="ml-2 text-xs text-slate-800 outline-none" /></label><span className="text-slate-300">–</span><label className="text-[10px] font-bold text-slate-500">To<input aria-label="Report end date" type="date" value={customTo} onChange={event => { setCustomTo(event.target.value); setPage(1); }} className="ml-2 text-xs text-slate-800 outline-none" /></label></div>}
          <div className="relative"><Download className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-pink-700" /><select aria-label="Export report" defaultValue="" onChange={event => { if (event.target.value === 'CSV') exportCsv(); if (event.target.value === 'EXCEL') exportExcel(); if (event.target.value === 'PDF') window.print(); event.target.value = ''; }} className="rounded-xl border border-white/40 bg-white py-2 pl-8 pr-3 text-xs font-bold text-[#C90052] shadow-sm"><option value="" disabled>Export report…</option><option value="CSV">Export CSV</option><option value="EXCEL">Export Excel</option><option value="PDF">Print / Save PDF</option></select></div>
        </div>
      </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-pink-100 bg-white px-4 py-3 text-xs shadow-sm print:hidden"><div className="flex items-center gap-2"><span className="rounded-xl bg-pink-50 p-2 text-pink-700"><Calendar className="h-4 w-4" /></span><div><span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Showing results for</span><span className="font-extrabold text-[#451323]">{periodLabel}</span></div></div><span className="ml-auto rounded-full bg-slate-50 px-3 py-1.5 text-[10px] font-medium text-slate-500">Previous period: {new Date(`${previousRange.from}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – {new Date(`${previousRange.to}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>

      {!ready ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading financial records…</div> : <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 print:hidden">
          <MetricCard label="Total Sales" value={currentTotals.sales} previous={previousTotals.sales} icon={<ShoppingBag className="h-4 w-4" />} accent="pink" hint="Order totals in this period" />
          <MetricCard label="Cost of Goods Sold" value={currentTotals.cogs} previous={previousTotals.cogs} icon={<Receipt className="h-4 w-4" />} accent="amber" hint="Purchased item costs" />
          <MetricCard label="Gross Profit" value={currentTotals.grossProfit} previous={previousTotals.grossProfit} icon={<TrendingUp className="h-4 w-4" />} accent="emerald" hint="Sales minus item costs" />
          <MetricCard label="Net Profit" value={currentTotals.netProfit} previous={previousTotals.netProfit} icon={<DollarSign className="h-4 w-4" />} accent={currentTotals.netProfit < 0 ? 'rose' : 'emerald'} hint="Gross profit minus expenses" />
          <MetricCard label="Total Expenses" value={currentTotals.expenses} previous={previousTotals.expenses} icon={<Wallet className="h-4 w-4" />} accent="rose" hint="Recorded operating expenses" />
          <MetricCard label="Collected Payments" value={currentTotals.collected} previous={previousTotals.collected} icon={<CreditCard className="h-4 w-4" />} accent="blue" hint="Payment records received in period" />
          <MetricCard label="Outstanding Payments" value={currentTotals.outstanding} previous={previousTotals.outstanding} icon={<Receipt className="h-4 w-4" />} accent="orange" hint="Balances due on orders created in period" />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3 print:hidden">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-bold text-slate-900">Period comparison</h3><p className="text-[11px] text-slate-500">See how this period compares with the one before it</p></div><div className="flex gap-3 rounded-full bg-slate-50 px-3 py-1.5 text-[10px] font-semibold"><span className="flex items-center gap-1.5 text-slate-600"><i style={{ backgroundColor: '#E6005C' }} className="h-2.5 w-2.5 rounded-full" />Current</span><span className="flex items-center gap-1.5 text-slate-500"><i style={{ backgroundColor: '#CBD5E1' }} className="h-2.5 w-2.5 rounded-full" />Previous</span></div></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><CompareBar label="Sales" current={currentTotals.sales} previous={previousTotals.sales} color="#E6005C" /><CompareBar label="Expenses" current={currentTotals.expenses} previous={previousTotals.expenses} color="#F97373" /><CompareBar label="Gross profit" current={currentTotals.grossProfit} previous={previousTotals.grossProfit} color="#10B981" /><CompareBar label="Collected" current={currentTotals.collected} previous={previousTotals.collected} color="#3B82F6" /></div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900">Profit summary</h3><p className="mt-1 text-[11px] text-slate-500">How this period’s result is calculated</p>
            <div className="mt-4 space-y-3 text-xs"><SummaryLine label="Total sales" value={currentTotals.sales} /><SummaryLine label="Cost of goods sold" value={-currentTotals.cogs} /><div className="border-t border-slate-100 pt-3"><SummaryLine label="Gross profit" value={currentTotals.grossProfit} strong /></div><SummaryLine label="Expenses" value={-currentTotals.expenses} /><div className="border-t border-slate-100 pt-3"><SummaryLine label="Net profit" value={currentTotals.netProfit} strong pink /></div></div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm print:hidden">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-sm font-bold text-slate-900">Transaction history</h3><p className="text-[11px] text-slate-500">Orders, payments received, and expenses for {periodLabel}</p></div><div className="flex flex-col gap-2 sm:flex-row"><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Search references, customers…" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs outline-none focus:border-pink-300 sm:w-64" /></div><select aria-label="Filter transaction type" value={recordType} onChange={event => { setRecordType(event.target.value as RecordType); setPage(1); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"><option value="ALL">All transaction types</option><option value="ORDER">Orders</option><option value="PAYMENT">Payments</option><option value="EXPENSE">Expenses</option></select></div></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Date &amp; Time</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Customer / Description</th><th className="px-4 py-3">Related Order / Category</th><th className="px-4 py-3">Payment Method</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{pageRows.length === 0 ? <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">No transactions match this period and search.</td></tr> : pageRows.map(row => <tr key={row.id} className="hover:bg-pink-50/30"><td className="whitespace-nowrap px-4 py-3 text-slate-500">{new Date(row.date).toLocaleString('en-PH')}</td><td className="font-semibold text-slate-800 px-4 py-3">{row.reference}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${row.type === 'ORDER' ? 'bg-pink-50 text-pink-800' : row.type === 'PAYMENT' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{row.type}</span></td><td className="max-w-[200px] truncate px-4 py-3 text-slate-700">{row.description}</td><td className="px-4 py-3 text-slate-500">{row.relatedOrder || '—'}</td><td className="px-4 py-3 text-slate-500">{row.method}</td><td className="px-4 py-3 text-right font-bold text-slate-900">{peso(row.amount)}</td><td className="px-4 py-3 text-slate-600">{row.status}</td></tr>)}</tbody></table></div>
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-[11px] text-slate-500"><span>{filteredRows.length ? `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filteredRows.length)} of ${filteredRows.length}` : '0 transactions'}</span><div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40">Previous</button><span>Page {page} of {pageCount}</span><button disabled={page >= pageCount} onClick={() => setPage(page + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40">Next</button></div></div>
        </div>
        <div className="financial-report-print hidden">
          <h1>Financial Report</h1><div>{periodLabel}</div>
          <div className="print-summary">{summaryRows.map(([label, amount]) => <div key={label}><strong>{label}</strong><br />{peso(amount)}</div>)}</div>
          <table><thead><tr><th>Date &amp; Time</th><th>Reference</th><th>Type</th><th>Customer / Description</th><th>Related Order / Category</th><th>Payment Method</th><th>Amount</th><th>Status</th></tr></thead><tbody>{filteredRows.map(row => <tr key={row.id}><td>{new Date(row.date).toLocaleString('en-PH')}</td><td>{row.reference}</td><td>{row.type}</td><td>{row.description}</td><td>{row.relatedOrder}</td><td>{row.method}</td><td>{peso(row.amount)}</td><td>{row.status}</td></tr>)}</tbody></table>
        </div>
      </>}
    </div>
  );
};

function downloadFile(content: string, filename: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character)); }

function MetricCard({ label, value, previous, icon, accent, hint }: { label: string; value: number; previous: number; icon: React.ReactNode; accent: string; hint: string }) {
  const styles: Record<string, { icon: string; stripe: string; wash: string }> = {
    pink: { icon: 'border-pink-100 bg-pink-50 text-pink-700', stripe: '#E6005C', wash: 'bg-pink-50/40' },
    amber: { icon: 'border-amber-100 bg-amber-50 text-amber-700', stripe: '#F59E0B', wash: 'bg-amber-50/30' },
    emerald: { icon: 'border-emerald-100 bg-emerald-50 text-emerald-700', stripe: '#10B981', wash: 'bg-emerald-50/30' },
    rose: { icon: 'border-rose-100 bg-rose-50 text-rose-700', stripe: '#F43F5E', wash: 'bg-rose-50/30' },
    blue: { icon: 'border-blue-100 bg-blue-50 text-blue-700', stripe: '#3B82F6', wash: 'bg-blue-50/30' },
    orange: { icon: 'border-orange-100 bg-orange-50 text-orange-700', stripe: '#F97316', wash: 'bg-orange-50/30' }
  };
  const delta = value - previous;
  return <div className={`group relative overflow-hidden rounded-2xl border border-slate-200/80 ${styles[accent].wash} bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md`}><div style={{ backgroundColor: styles[accent].stripe }} className="absolute inset-x-0 top-0 h-1" /><div className="flex items-center justify-between"><span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span><span className={`rounded-xl border p-2.5 transition-transform group-hover:scale-105 ${styles[accent].icon}`}>{icon}</span></div><div className="mt-3 truncate text-[26px] font-black tracking-tight text-slate-900">{peso(value)}</div><div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5"><span className="text-[10px] text-slate-500">{hint}</span><span className={`whitespace-nowrap rounded-full px-2 py-1 text-[9px] font-extrabold ${delta >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{delta >= 0 ? '↑' : '↓'} {peso(Math.abs(delta))}</span></div></div>;
}
function CompareBar({ label, current, previous, color }: { label: string; current: number; previous: number; color: string }) {
  const maximum = Math.max(current, previous, 1);
  const currentWidth = Math.max(current > 0 ? 5 : 0, (current / maximum) * 100);
  const previousWidth = Math.max(previous > 0 ? 5 : 0, (previous / maximum) * 100);
  return <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-slate-50 p-3.5 transition-shadow hover:shadow-sm"><div className="mb-3 flex items-center justify-between"><span className="text-xs font-extrabold text-slate-800">{label}</span><span className="rounded-full bg-white px-2 py-1 text-[9px] font-bold text-slate-500 shadow-sm">vs prior</span></div><div className="space-y-3"><div><div className="mb-1 flex items-center justify-between text-[10px]"><span className="font-semibold text-slate-500">Current</span><span className="font-extrabold text-slate-800">{peso(current)}</span></div><div className="h-2.5 overflow-hidden rounded-full bg-white shadow-inner"><div role="img" aria-label={`${label} current ${peso(current)}`} title={`Current: ${peso(current)}`} style={{ width: `${currentWidth}%`, backgroundColor: color }} className="h-full rounded-full transition-all duration-500" /></div></div><div><div className="mb-1 flex items-center justify-between text-[10px]"><span className="font-semibold text-slate-400">Previous</span><span className="font-bold text-slate-500">{peso(previous)}</span></div><div className="h-2.5 overflow-hidden rounded-full bg-white shadow-inner"><div role="img" aria-label={`${label} previous ${peso(previous)}`} title={`Previous: ${peso(previous)}`} style={{ width: `${previousWidth}%`, backgroundColor: '#CBD5E1' }} className="h-full rounded-full transition-all duration-500" /></div></div></div></div>;
}
function SummaryLine({ label, value, strong = false, pink = false }: { label: string; value: number; strong?: boolean; pink?: boolean }) {
  return <div className={`flex items-center justify-between gap-2 ${strong ? 'font-bold' : ''}`}><span className={strong ? 'text-slate-800' : 'text-slate-500'}>{label}</span><span className={pink ? 'text-pink-700' : value < 0 ? 'text-rose-600' : 'text-slate-900'}>{peso(value)}</span></div>;
}
