import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import {
  BarChart3, Download, Calendar, DollarSign, TrendingUp, Receipt,
  Search, ShoppingBag, CreditCard, Wallet, FileText, Table, Printer,
  ChevronDown
} from 'lucide-react';
import { calculateOrderSummary } from '../../services/calc';
import { Expense, Order, OrderItem, Payment } from '../../types';
import { useApp } from '../../context/AppContext';
import { SHOPPER_LOGO_DATA_URL } from '../../assets/shopperLogo';

type Period = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM';
type RecordType = 'ALL' | 'ORDER' | 'PAYMENT' | 'EXPENSE';
type ReportRow = {
  id: string;
  date: string;
  reference: string;
  type: Exclude<RecordType, 'ALL'>;
  description: string;
  relatedOrder: string;
  method: string;
  amount: number;
  status: string;
  searchTerms?: string;
};

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
  const { businessInfo, currentUser, addToast } = useApp();
  const [period, setPeriod] = useState<Period>('MONTHLY');
  const [customFrom, setCustomFrom] = useState(dateKey(new Date()));
  const [customTo, setCustomTo] = useState(dateKey(new Date()));
  const [search, setSearch] = useState('');
  const [recordType, setRecordType] = useState<RecordType>('ALL');
  const [page, setPage] = useState(1);
  const [exportOpen, setExportOpen] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  const storeName = businessInfo.storeName || 'ANTIQUE PASABUY & RETAIL';
  const storeAddress = businessInfo.address || 'San Angel, San Jose de Buenavista, Antique 5700';
  const storePhone = businessInfo.phone || '09054853573';
  const preparer = currentUser?.fullName || currentUser?.username || 'Admin';

  // Handle clicking outside export dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync print events
  useEffect(() => {
    const onBeforePrint = () => document.body.classList.add('printing-financial-report');
    const onAfterPrint = () => document.body.classList.remove('printing-financial-report');
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', onAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', onAfterPrint);
      document.body.classList.remove('printing-financial-report');
    };
  }, []);

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
      rows.push({
        id: `order-${order.id}`,
        date: order.createdAt,
        reference: order.orderNo,
        type: 'ORDER',
        description: order.customerName || 'Walk-in Customer',
        relatedOrder: order.orderNo,
        method: '—',
        amount: summary.grandTotal,
        status: order.status.replace(/_/g, ' '),
        searchTerms: rowsForOrder.map(item => item.productName).join(' ')
      });
    }
    for (const payment of allPayments) {
      if (!inRange(payment.paymentDate)) continue;
      const order = orderById.get(payment.orderId);
      rows.push({
        id: `payment-${payment.id}`,
        date: payment.paymentDate,
        reference: payment.referenceNo || payment.id,
        type: 'PAYMENT',
        description: order?.customerName || 'Payment received',
        relatedOrder: order?.orderNo || payment.orderId,
        method: payment.method,
        amount: payment.amount,
        status: 'RECEIVED'
      });
    }
    for (const expense of allExpenses) {
      if (!inRange(expense.expenseDate)) continue;
      rows.push({
        id: `expense-${expense.id}`,
        date: expense.expenseDate,
        reference: expense.id,
        type: 'EXPENSE',
        description: expense.description,
        relatedOrder: expense.category,
        method: '—',
        amount: expense.amount,
        status: 'RECORDED'
      });
    }
    return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allOrders, allItems, allPayments, allExpenses, tiers, range.from, range.to]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return transactions.filter(row =>
      (recordType === 'ALL' || row.type === recordType) &&
      (!query || [row.reference, row.description, row.relatedOrder, row.method, row.status, row.searchTerms || ''].some(value => value.toLocaleLowerCase().includes(query)))
    );
  }, [transactions, search, recordType]);

  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  const periodLabel = `${new Date(`${range.from}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })} – ${new Date(`${range.to}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  const summaryRows: [string, number][] = [
    ['Total Sales', currentTotals.sales],
    ['Cost of Goods Sold', currentTotals.cogs],
    ['Gross Profit', currentTotals.grossProfit],
    ['Total Operating Expenses', currentTotals.expenses],
    ['Net Profit', currentTotals.netProfit],
    ['Outstanding Receivables', currentTotals.outstanding],
    ['Collected Payments', currentTotals.collected]
  ];

  // 1. EXPORT CSV
  const exportCsv = () => {
    setExportOpen(false);
    const filename = `financial-report-${range.from}-to-${range.to}.csv`;
    const lines: unknown[][] = [
      ['BUSINESS NAME', storeName],
      ['STORE ADDRESS', storeAddress],
      ['CONTACT', storePhone],
      ['REPORT', 'Financial Performance Report & Transaction Ledger'],
      ['PERIOD', periodLabel],
      ['GENERATED ON', new Date().toLocaleString('en-PH')],
      ['PREPARED BY', preparer],
      [],
      ['=== FINANCIAL SUMMARY ===', ''],
      ['Metric', 'Amount (PHP)'],
      ...summaryRows.map(([label, val]) => [label, val.toFixed(2)]),
      [],
      ['=== TRANSACTION LEDGER ===', ''],
      ['Date & Time', 'Reference', 'Type', 'Customer / Description', 'Related Order / Category', 'Payment Method', 'Amount (PHP)', 'Status'],
      ...filteredRows.map(row => [
        new Date(row.date).toLocaleString('en-PH'),
        row.reference,
        row.type,
        row.description,
        row.relatedOrder,
        row.method,
        row.amount.toFixed(2),
        row.status
      ])
    ];

    const csvContent = '\ufeff' + lines.map(row =>
      row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
    ).join('\r\n');

    downloadFile(csvContent, filename, 'text/csv;charset=utf-8');
    addToast('Financial Report CSV exported successfully!', 'success');
  };

  // 2. EXPORT EXCEL
  const exportExcel = () => {
    setExportOpen(false);
    const filename = `financial-report-${range.from}-to-${range.to}.xls`;
    const summaryHtml = summaryRows.map(([label, val]) => `
      <tr>
        <td style="padding:6px 10px;font-weight:bold;background:#FDF2F7;border:1px solid #E2E8F0;">${escapeHtml(label)}</td>
        <td style="padding:6px 10px;text-align:right;font-weight:bold;border:1px solid #E2E8F0;">₱${val.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>
    `).join('');

    const rowsHtml = filteredRows.map((row, i) => `
      <tr style="background:${i % 2 === 0 ? '#FFFFFF' : '#F8FAFC'};">
        <td style="padding:6px;border:1px solid #E2E8F0;">${escapeHtml(new Date(row.date).toLocaleString('en-PH'))}</td>
        <td style="padding:6px;font-weight:bold;border:1px solid #E2E8F0;">${escapeHtml(row.reference)}</td>
        <td style="padding:6px;text-align:center;border:1px solid #E2E8F0;">${escapeHtml(row.type)}</td>
        <td style="padding:6px;border:1px solid #E2E8F0;">${escapeHtml(row.description)}</td>
        <td style="padding:6px;border:1px solid #E2E8F0;">${escapeHtml(row.relatedOrder || '—')}</td>
        <td style="padding:6px;border:1px solid #E2E8F0;">${escapeHtml(row.method)}</td>
        <td style="padding:6px;text-align:right;font-weight:bold;border:1px solid #E2E8F0;">₱${row.amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td style="padding:6px;border:1px solid #E2E8F0;">${escapeHtml(row.status)}</td>
      </tr>
    `).join('');

    const excelHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Financial Report</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
          <meta http-equiv="content-type" content="text/plain; charset=UTF-8"/>
          <style>
            body { font-family: Arial, sans-serif; font-size: 11px; }
            table { border-collapse: collapse; }
          </style>
        </head>
        <body>
          <h2 style="margin:0;color:#451323;font-size:16px;">${escapeHtml(storeName)}</h2>
          <p style="margin:2px 0;color:#64748B;font-size:11px;">${escapeHtml(storeAddress)} · Mobile: ${escapeHtml(storePhone)}</p>
          <h3 style="margin:8px 0 4px;color:#C90052;font-size:13px;">FINANCIAL REPORT (${escapeHtml(periodLabel)})</h3>
          <p style="margin:2px 0 12px;color:#64748B;font-size:10px;">Generated: ${new Date().toLocaleString('en-PH')} | Prepared by: ${escapeHtml(preparer)}</p>
          
          <table style="width:400px;margin-bottom:20px;border:1px solid #CBD5E1;">
            <thead>
              <tr style="background:#451323;color:#FFFFFF;">
                <th colspan="2" style="padding:8px;text-align:left;font-size:12px;">Financial Performance Summary</th>
              </tr>
            </thead>
            <tbody>
              ${summaryHtml}
            </tbody>
          </table>

          <table style="width:100%;border:1px solid #CBD5E1;">
            <thead>
              <tr style="background:#C90052;color:#FFFFFF;font-weight:bold;">
                <th style="padding:8px;text-align:left;">Date &amp; Time</th>
                <th style="padding:8px;text-align:left;">Reference #</th>
                <th style="padding:8px;text-align:center;">Type</th>
                <th style="padding:8px;text-align:left;">Customer / Description</th>
                <th style="padding:8px;text-align:left;">Related Order / Category</th>
                <th style="padding:8px;text-align:left;">Payment Method</th>
                <th style="padding:8px;text-align:right;">Amount (PHP)</th>
                <th style="padding:8px;text-align:left;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </body>
      </html>
    `;

    downloadFile(`\ufeff${excelHtml}`, filename, 'application/vnd.ms-excel;charset=utf-8');
    addToast('Financial Report Excel workbook exported successfully!', 'success');
  };

  // 3. EXPORT DIRECT PDF
  const exportPdf = async () => {
    setExportOpen(false);
    const target = document.getElementById('printable-financial-report');
    if (!target) {
      addToast('Report content not ready for PDF download', 'error');
      return;
    }

    setIsExportingPdf(true);
    addToast('Generating Financial Report PDF, please wait...', 'info');

    try {
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `financial-report-${dateStr}.pdf`;

      const opt = {
        margin: [6, 6, 6, 6],
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          scrollY: 0,
          scrollX: 0
        },
        jsPDF: {
          unit: 'mm',
          format: 'a4',
          orientation: 'landscape'
        }
      };

      // Create an offscreen active render container at (0, 0)
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.top = '0';
      container.style.left = '0';
      container.style.width = '297mm';
      container.style.zIndex = '-9999';
      container.style.opacity = '1';
      container.style.pointerEvents = 'none';
      container.style.background = '#ffffff';
      container.style.padding = '8mm';

      const clone = target.cloneNode(true) as HTMLElement;
      clone.style.display = 'block';
      clone.style.visibility = 'visible';
      container.appendChild(clone);
      document.body.appendChild(container);

      await new Promise(r => setTimeout(r, 250));

      const html2pdfModule = (await import('html2pdf.js')).default || (await import('html2pdf.js'));
      await html2pdfModule().set(opt).from(clone).save();

      document.body.removeChild(container);
      addToast('Financial report PDF downloaded successfully!', 'success');
    } catch (err: any) {
      console.error('PDF export error:', err);
      addToast('Direct PDF export encountered an issue. Opening print dialog...', 'info');
      printReport();
    } finally {
      setIsExportingPdf(false);
    }
  };

  // 4. PRINT REPORT
  const printReport = () => {
    setExportOpen(false);
    document.body.classList.add('printing-financial-report');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing-financial-report');
    }, 1500);
  };

  // Executive Branded Print Document
  const renderPrintDocument = () => (
    <article id="printable-financial-report" className="hidden print:block bg-white text-slate-900">
      {/* Company Header */}
      <header className="flex items-center justify-between border-b-2 border-[#C90052] pb-4 mb-4">
        <div className="flex items-center gap-4">
          <img src={SHOPPER_LOGO_DATA_URL} alt="Company logo" className="h-14 w-auto object-contain" />
          <div>
            <h1 className="text-xl font-extrabold text-[#451323] m-0">{storeName}</h1>
            <p className="text-xs text-slate-600 m-0">{storeAddress}</p>
            <p className="text-xs text-slate-500 m-0">Contact: {storePhone} {businessInfo.email ? `· ${businessInfo.email}` : ''}</p>
          </div>
        </div>
        <div className="text-right">
          <h2 className="text-base font-black text-[#C90052] uppercase tracking-wide m-0">Financial Performance Report</h2>
          <p className="text-xs font-semibold text-slate-700 mt-1">Period: {periodLabel}</p>
          <p className="text-[10px] text-slate-400">Date Prepared: {new Date().toLocaleString('en-PH')} · Prepared by: {preparer}</p>
        </div>
      </header>

      {/* KPI Summary Cards */}
      <section className="grid grid-cols-4 gap-2.5 mb-5">
        <div className="rounded-xl border border-pink-200 bg-pink-50/50 p-2.5">
          <span className="block text-[10px] font-bold uppercase text-pink-700">Total Sales</span>
          <strong className="text-sm font-black text-slate-900">{peso(currentTotals.sales)}</strong>
          <span className="block text-[9px] text-slate-500">Order revenue</span>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-2.5">
          <span className="block text-[10px] font-bold uppercase text-amber-700">Cost of Goods</span>
          <strong className="text-sm font-black text-slate-900">{peso(currentTotals.cogs)}</strong>
          <span className="block text-[9px] text-slate-500">Purchased costs</span>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-2.5">
          <span className="block text-[10px] font-bold uppercase text-emerald-700">Gross Profit</span>
          <strong className="text-sm font-black text-slate-900">{peso(currentTotals.grossProfit)}</strong>
          <span className="block text-[9px] text-slate-500">Sales minus item costs</span>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
          <span className="block text-[10px] font-bold uppercase text-slate-700">Net Profit</span>
          <strong className={`text-sm font-black ${currentTotals.netProfit < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
            {peso(currentTotals.netProfit)}
          </strong>
          <span className="block text-[9px] text-slate-500">Gross profit minus expenses</span>
        </div>
      </section>

      {/* Additional Metrics Strip */}
      <section className="flex items-center justify-between border border-slate-200 rounded-xl px-4 py-2 mb-4 bg-slate-50/60 text-xs font-semibold">
        <div><span>Total Expenses: </span><strong className="text-rose-700">{peso(currentTotals.expenses)}</strong></div>
        <div className="w-px h-4 bg-slate-300" />
        <div><span>Collected Payments: </span><strong className="text-blue-700">{peso(currentTotals.collected)}</strong></div>
        <div className="w-px h-4 bg-slate-300" />
        <div><span>Outstanding Receivables: </span><strong className="text-amber-700">{peso(currentTotals.outstanding)}</strong></div>
        <div className="w-px h-4 bg-slate-300" />
        <div><span>Total Records: </span><strong>{filteredRows.length} transactions</strong></div>
      </section>

      {/* Transactions Ledger Table */}
      <table className="w-full border-collapse text-left text-[10px] mb-5">
        <thead>
          <tr className="bg-[#451323] text-white">
            <th className="p-2 border border-slate-600">Date &amp; Time</th>
            <th className="p-2 border border-slate-600">Reference #</th>
            <th className="p-2 border border-slate-600 text-center">Type</th>
            <th className="p-2 border border-slate-600">Customer / Description</th>
            <th className="p-2 border border-slate-600">Related Order / Category</th>
            <th className="p-2 border border-slate-600">Payment Method</th>
            <th className="p-2 border border-slate-600 text-right">Amount (PHP)</th>
            <th className="p-2 border border-slate-600">Status</th>
          </tr>
        </thead>
        <tbody>
          {filteredRows.length === 0 ? (
            <tr><td colSpan={8} className="p-4 text-center text-slate-400 border border-slate-200">No transactions recorded for this period.</td></tr>
          ) : (
            filteredRows.map((row, idx) => (
              <tr key={row.id} className={idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                <td className="p-1.5 border border-slate-200 whitespace-nowrap">{new Date(row.date).toLocaleString('en-PH')}</td>
                <td className="p-1.5 border border-slate-200 font-bold">{row.reference}</td>
                <td className="p-1.5 border border-slate-200 text-center">
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                    row.type === 'ORDER' ? 'bg-pink-100 text-pink-800' :
                    row.type === 'PAYMENT' ? 'bg-emerald-100 text-emerald-800' :
                    'bg-amber-100 text-amber-800'
                  }`}>
                    {row.type}
                  </span>
                </td>
                <td className="p-1.5 border border-slate-200">{row.description}</td>
                <td className="p-1.5 border border-slate-200 text-slate-500">{row.relatedOrder || '—'}</td>
                <td className="p-1.5 border border-slate-200">{row.method}</td>
                <td className="p-1.5 border border-slate-200 text-right font-bold">{peso(row.amount)}</td>
                <td className="p-1.5 border border-slate-200">{row.status}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Signature & Sign-off Lines */}
      <footer className="grid grid-cols-3 gap-8 pt-4 border-t border-slate-300 text-center text-xs">
        <div>
          <span className="block text-slate-500 text-[10px]">Prepared by:</span>
          <div className="mt-8 border-b border-slate-400 mx-auto w-3/4" />
          <span className="block font-bold text-slate-800 mt-1">{preparer}</span>
        </div>
        <div>
          <span className="block text-slate-500 text-[10px]">Verified by:</span>
          <div className="mt-8 border-b border-slate-400 mx-auto w-3/4" />
          <span className="block font-bold text-slate-800 mt-1">Store Supervisor</span>
        </div>
        <div>
          <span className="block text-slate-500 text-[10px]">Approved by:</span>
          <div className="mt-8 border-b border-slate-400 mx-auto w-3/4" />
          <span className="block font-bold text-slate-800 mt-1">Management / Owner</span>
        </div>
      </footer>
    </article>
  );

  return (
    <div className="financial-report-page space-y-5">
      {/* Branded Banner */}
      <div style={{ background: 'linear-gradient(115deg, #451323 0%, #6B1736 52%, #B0125B 100%)' }} className="relative overflow-hidden rounded-3xl bg-[#451323] p-5 text-white shadow-xl print:hidden sm:p-6">
        <div className="pointer-events-none absolute -right-10 -top-20 h-64 w-64 rounded-full border-[30px] border-white/5" />
        <div className="pointer-events-none absolute right-28 -bottom-24 h-48 w-48 rounded-full bg-pink-500/10 blur-2xl" />
        
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-pink-100">
              <BarChart3 className="h-3.5 w-3.5" /> Business overview
            </div>
            <h2 className="flex items-center gap-2 text-2xl font-black tracking-tight text-white">Financial Reports</h2>
            <p className="mt-1 max-w-lg text-xs text-pink-100/80">A clear view of your sales, costs, collections, and profit.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Period Filter Buttons */}
            <div className="flex flex-wrap gap-1 rounded-2xl border border-white/15 bg-black/15 p-1 text-xs font-semibold backdrop-blur-sm">
              {([['DAILY', 'Daily'], ['WEEKLY', 'Weekly'], ['MONTHLY', 'Monthly'], ['YEARLY', 'Yearly'], ['CUSTOM', 'Custom']] as [Period, string][]).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => { setPeriod(value); setPage(1); }}
                  style={period === value ? { backgroundColor: '#FFFFFF', color: '#6B1736' } : { color: 'rgba(255,255,255,0.9)' }}
                  className={`rounded-xl px-3 py-2 font-bold transition ${period === value ? 'shadow-md' : 'hover:bg-white/10'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Custom Date Pickers */}
            {period === 'CUSTOM' && (
              <div className="flex items-center gap-2 rounded-2xl border border-white/20 bg-white px-3 py-2 text-slate-700 shadow-sm">
                <label className="text-[10px] font-bold text-slate-500">
                  From
                  <input
                    aria-label="Report start date"
                    type="date"
                    value={customFrom}
                    onChange={event => { setCustomFrom(event.target.value); setPage(1); }}
                    className="ml-2 text-xs text-slate-800 outline-none"
                  />
                </label>
                <span className="text-slate-300">–</span>
                <label className="text-[10px] font-bold text-slate-500">
                  To
                  <input
                    aria-label="Report end date"
                    type="date"
                    value={customTo}
                    onChange={event => { setCustomTo(event.target.value); setPage(1); }}
                    className="ml-2 text-xs text-slate-800 outline-none"
                  />
                </label>
              </div>
            )}

            {/* Custom Modern 4-in-1 Export Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setExportOpen(open => !open)}
                disabled={isExportingPdf}
                className="flex items-center gap-2 rounded-2xl border border-white/30 bg-white px-4 py-2.5 text-xs font-bold text-[#6B1736] shadow-md transition-all hover:bg-pink-50 active:scale-95 disabled:opacity-60"
              >
                <Download className={`h-4 w-4 text-[#C90052] ${isExportingPdf ? 'animate-bounce' : ''}`} />
                <span>{isExportingPdf ? 'Generating PDF...' : 'Export Report'}</span>
                <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${exportOpen ? 'rotate-180' : ''}`} />
              </button>

              {exportOpen && (
                <div className="absolute right-0 top-full mt-2 z-50 w-72 overflow-hidden rounded-2xl border border-slate-100 bg-white p-2 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3 py-1.5 border-b border-slate-100 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Choose Export Format</span>
                  </div>

                  {/* 1. CSV */}
                  <button
                    type="button"
                    onClick={exportCsv}
                    className="w-full flex items-start gap-3 rounded-xl p-2.5 text-left transition hover:bg-slate-50 group"
                  >
                    <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700 group-hover:bg-emerald-100">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">Export as CSV</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">.csv</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">Raw spreadsheet for data analysis</p>
                    </div>
                  </button>

                  {/* 2. Excel */}
                  <button
                    type="button"
                    onClick={exportExcel}
                    className="w-full flex items-start gap-3 rounded-xl p-2.5 text-left transition hover:bg-slate-50 group"
                  >
                    <div className="rounded-lg bg-blue-50 p-2 text-blue-700 group-hover:bg-blue-100">
                      <Table className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">Export as Excel</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">.xls</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">Formatted workbook with calculations</p>
                    </div>
                  </button>

                  {/* 3. Direct PDF Download */}
                  <button
                    type="button"
                    onClick={exportPdf}
                    disabled={isExportingPdf}
                    className="w-full flex items-start gap-3 rounded-xl p-2.5 text-left transition hover:bg-slate-50 group disabled:opacity-50"
                  >
                    <div className="rounded-lg bg-rose-50 p-2 text-rose-700 group-hover:bg-rose-100">
                      <Download className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">Download PDF</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-800">.pdf</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">Direct file download with logo &amp; KPIs</p>
                    </div>
                  </button>

                  {/* 4. Print / Save as PDF */}
                  <button
                    type="button"
                    onClick={printReport}
                    className="w-full flex items-start gap-3 rounded-xl p-2.5 text-left transition hover:bg-slate-50 group border-t border-slate-100 mt-1 pt-2"
                  >
                    <div className="rounded-lg bg-pink-50 p-2 text-[#C90052] group-hover:bg-pink-100">
                      <Printer className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">Print / Save as PDF</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-pink-100 text-[#C90052]">Print</span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">Open browser print preview dialog</p>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Showing results status bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-pink-100 bg-white px-4 py-3 text-xs shadow-sm print:hidden">
        <div className="flex items-center gap-2">
          <span className="rounded-xl bg-pink-50 p-2 text-pink-700">
            <Calendar className="h-4 w-4" />
          </span>
          <div>
            <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Showing results for</span>
            <span className="font-extrabold text-[#451323]">{periodLabel}</span>
          </div>
        </div>
        <span className="ml-auto rounded-full bg-slate-50 px-3 py-1.5 text-[10px] font-medium text-slate-500">
          Previous period: {new Date(`${previousRange.from}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – {new Date(`${previousRange.to}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
      </div>

      {!ready ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Loading financial records…
        </div>
      ) : (
        <>
          {/* Executive KPI Metric Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 print:hidden">
            <MetricCard label="Total Sales" value={currentTotals.sales} previous={previousTotals.sales} icon={<ShoppingBag className="h-4 w-4" />} accent="pink" hint="Order totals in this period" />
            <MetricCard label="Cost of Goods Sold" value={currentTotals.cogs} previous={previousTotals.cogs} icon={<Receipt className="h-4 w-4" />} accent="amber" hint="Purchased item costs" />
            <MetricCard label="Gross Profit" value={currentTotals.grossProfit} previous={previousTotals.grossProfit} icon={<TrendingUp className="h-4 w-4" />} accent="emerald" hint="Sales minus item costs" />
            <MetricCard label="Net Profit" value={currentTotals.netProfit} previous={previousTotals.netProfit} icon={<DollarSign className="h-4 w-4" />} accent={currentTotals.netProfit < 0 ? 'rose' : 'emerald'} hint="Gross profit minus expenses" />
            <MetricCard label="Total Expenses" value={currentTotals.expenses} previous={previousTotals.expenses} icon={<Wallet className="h-4 w-4" />} accent="rose" hint="Recorded operating expenses" />
            <MetricCard label="Collected Payments" value={currentTotals.collected} previous={previousTotals.collected} icon={<CreditCard className="h-4 w-4" />} accent="blue" hint="Payment records received in period" />
            <MetricCard label="Outstanding Payments" value={currentTotals.outstanding} previous={previousTotals.outstanding} icon={<Receipt className="h-4 w-4" />} accent="orange" hint="Balances due on orders created in period" />
          </div>

          {/* Comparison and Profit Breakdown */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3 print:hidden">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Period comparison</h3>
                  <p className="text-[11px] text-slate-500">See how this period compares with the one before it</p>
                </div>
                <div className="flex gap-3 rounded-full bg-slate-50 px-3 py-1.5 text-[10px] font-semibold">
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <i style={{ backgroundColor: '#E6005C' }} className="h-2.5 w-2.5 rounded-full" />Current
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-500">
                    <i style={{ backgroundColor: '#CBD5E1' }} className="h-2.5 w-2.5 rounded-full" />Previous
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <CompareBar label="Sales" current={currentTotals.sales} previous={previousTotals.sales} color="#E6005C" />
                <CompareBar label="Expenses" current={currentTotals.expenses} previous={previousTotals.expenses} color="#F97373" />
                <CompareBar label="Gross profit" current={currentTotals.grossProfit} previous={previousTotals.grossProfit} color="#10B981" />
                <CompareBar label="Collected" current={currentTotals.collected} previous={previousTotals.collected} color="#3B82F6" />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900">Profit summary</h3>
              <p className="mt-1 text-[11px] text-slate-500">How this period’s result is calculated</p>
              <div className="mt-4 space-y-3 text-xs">
                <SummaryLine label="Total sales" value={currentTotals.sales} />
                <SummaryLine label="Cost of goods sold" value={-currentTotals.cogs} />
                <div className="border-t border-slate-100 pt-3">
                  <SummaryLine label="Gross profit" value={currentTotals.grossProfit} strong />
                </div>
                <SummaryLine label="Expenses" value={-currentTotals.expenses} />
                <div className="border-t border-slate-100 pt-3">
                  <SummaryLine label="Net profit" value={currentTotals.netProfit} strong pink />
                </div>
              </div>
            </div>
          </div>

          {/* Transactions Ledger Card */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm print:hidden">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Transaction history</h3>
                <p className="text-[11px] text-slate-500">Orders, payments received, and expenses for {periodLabel}</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    value={search}
                    onChange={event => { setSearch(event.target.value); setPage(1); }}
                    placeholder="Search references, customers…"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs outline-none focus:border-pink-300 sm:w-64"
                  />
                </div>
                <select
                  aria-label="Filter transaction type"
                  value={recordType}
                  onChange={event => { setRecordType(event.target.value as RecordType); setPage(1); }}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                >
                  <option value="ALL">All transaction types</option>
                  <option value="ORDER">Orders</option>
                  <option value="PAYMENT">Payments</option>
                  <option value="EXPENSE">Expenses</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-xs">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Date &amp; Time</th>
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Customer / Description</th>
                    <th className="px-4 py-3">Related Order / Category</th>
                    <th className="px-4 py-3">Payment Method</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                        No transactions match this period and search.
                      </td>
                    </tr>
                  ) : (
                    pageRows.map(row => (
                      <tr key={row.id} className="hover:bg-pink-50/30">
                        <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                          {new Date(row.date).toLocaleString('en-PH')}
                        </td>
                        <td className="font-semibold text-slate-800 px-4 py-3">{row.reference}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-1 text-[9px] font-bold ${
                            row.type === 'ORDER' ? 'bg-pink-50 text-pink-800' :
                            row.type === 'PAYMENT' ? 'bg-emerald-50 text-emerald-800' :
                            'bg-amber-50 text-amber-800'
                          }`}>
                            {row.type}
                          </span>
                        </td>
                        <td className="max-w-[200px] truncate px-4 py-3 text-slate-700">{row.description}</td>
                        <td className="px-4 py-3 text-slate-500">{row.relatedOrder || '—'}</td>
                        <td className="px-4 py-3 text-slate-500">{row.method}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900">{peso(row.amount)}</td>
                        <td className="px-4 py-3 text-slate-600">{row.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-[11px] text-slate-500">
              <span>{filteredRows.length ? `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filteredRows.length)} of ${filteredRows.length}` : '0 transactions'}</span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40"
                >
                  Previous
                </button>
                <span>Page {page} of {pageCount}</span>
                <button
                  disabled={page >= pageCount}
                  onClick={() => setPage(page + 1)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Portal render for Executive Print & PDF generation */}
      {createPortal(renderPrintDocument(), document.body)}
    </div>
  );
};

function downloadFile(content: string, filename: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[character] || character));
}

function MetricCard({ label, value, previous, icon, accent, hint }: {
  label: string;
  value: number;
  previous: number;
  icon: React.ReactNode;
  accent: string;
  hint: string;
}) {
  const styles: Record<string, { icon: string; stripe: string; wash: string }> = {
    pink: { icon: 'border-pink-100 bg-pink-50 text-pink-700', stripe: '#E6005C', wash: 'bg-pink-50/40' },
    amber: { icon: 'border-amber-100 bg-amber-50 text-amber-700', stripe: '#F59E0B', wash: 'bg-amber-50/30' },
    emerald: { icon: 'border-emerald-100 bg-emerald-50 text-emerald-700', stripe: '#10B981', wash: 'bg-emerald-50/30' },
    rose: { icon: 'border-rose-100 bg-rose-50 text-rose-700', stripe: '#F43F5E', wash: 'bg-rose-50/30' },
    blue: { icon: 'border-blue-100 bg-blue-50 text-blue-700', stripe: '#3B82F6', wash: 'bg-blue-50/30' },
    orange: { icon: 'border-orange-100 bg-orange-50 text-orange-700', stripe: '#F97316', wash: 'bg-orange-50/30' }
  };
  const delta = value - previous;
  return (
    <div className={`group relative overflow-hidden rounded-2xl border border-slate-200/80 ${styles[accent].wash} bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md`}>
      <div style={{ backgroundColor: styles[accent].stripe }} className="absolute inset-x-0 top-0 h-1" />
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
        <span className={`rounded-xl border p-2.5 transition-transform group-hover:scale-105 ${styles[accent].icon}`}>
          {icon}
        </span>
      </div>
      <div className="mt-3 truncate text-[26px] font-black tracking-tight text-slate-900">{peso(value)}</div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
        <span className="text-[10px] text-slate-500">{hint}</span>
        <span className={`whitespace-nowrap rounded-full px-2 py-1 text-[9px] font-extrabold ${delta >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {delta >= 0 ? '↑' : '↓'} {peso(Math.abs(delta))}
        </span>
      </div>
    </div>
  );
}

function CompareBar({ label, current, previous, color }: { label: string; current: number; previous: number; color: string }) {
  const maximum = Math.max(current, previous, 1);
  const currentWidth = Math.max(current > 0 ? 5 : 0, (current / maximum) * 100);
  const previousWidth = Math.max(previous > 0 ? 5 : 0, (previous / maximum) * 100);
  return (
    <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-slate-50 p-3.5 transition-shadow hover:shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-extrabold text-slate-800">{label}</span>
        <span className="rounded-full bg-white px-2 py-1 text-[9px] font-bold text-slate-500 shadow-sm">vs prior</span>
      </div>
      <div className="space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between text-[10px]">
            <span className="font-semibold text-slate-500">Current</span>
            <span className="font-extrabold text-slate-800">{peso(current)}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white shadow-inner">
            <div
              role="img"
              aria-label={`${label} current ${peso(current)}`}
              title={`Current: ${peso(current)}`}
              style={{ width: `${currentWidth}%`, backgroundColor: color }}
              className="h-full rounded-full transition-all duration-500"
            />
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between text-[10px]">
            <span className="font-semibold text-slate-400">Previous</span>
            <span className="font-bold text-slate-500">{peso(previous)}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white shadow-inner">
            <div
              role="img"
              aria-label={`${label} previous ${peso(previous)}`}
              title={`Previous: ${peso(previous)}`}
              style={{ width: `${previousWidth}%`, backgroundColor: '#CBD5E1' }}
              className="h-full rounded-full transition-all duration-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryLine({ label, value, strong = false, pink = false }: { label: string; value: number; strong?: boolean; pink?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-2 ${strong ? 'font-bold' : ''}`}>
      <span className={strong ? 'text-slate-800' : 'text-slate-500'}>{label}</span>
      <span className={pink ? 'text-pink-700' : value < 0 ? 'text-rose-600' : 'text-slate-900'}>{peso(value)}</span>
    </div>
  );
}
