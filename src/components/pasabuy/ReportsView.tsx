import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import {
  BarChart3, Download, Calendar, DollarSign, TrendingUp, Receipt,
  Search, ShoppingBag, CreditCard, Wallet, FileText, Table, Printer,
  ChevronDown, ArrowUpRight, ArrowDownRight, Building2
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
  const storeEmail = businessInfo.email || 'ellimac07161993@gmail.com';
  const preparer = currentUser?.fullName || currentUser?.username || 'Admin';

  // Close dropdown on click outside
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

  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  const periodLabel = `${new Date(`${range.from}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })} – ${new Date(`${range.to}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  
  const summaryRows: [string, number][] = [
    ['Gross Sales Revenue', currentTotals.sales],
    ['Cost of Goods Sold (COGS)', currentTotals.cogs],
    ['Gross Operating Profit', currentTotals.grossProfit],
    ['Operating Expenditures', currentTotals.expenses],
    ['Net Operating Profit / (Loss)', currentTotals.netProfit],
    ['Collected Payments Received', currentTotals.collected],
    ['Outstanding Accounts Receivable', currentTotals.outstanding]
  ];

  // 1. EXPORT CSV (Corporate Bookkeeping Format with UTF-8 BOM)
  const exportCsv = () => {
    setExportOpen(false);
    const filename = `financial-statement-${range.from}-to-${range.to}.csv`;
    const lines: unknown[][] = [
      ['STATEMENT OF FINANCIAL PERFORMANCE & AUDIT TRAIL'],
      ['Entity Name:', storeName],
      ['Business Address:', storeAddress],
      ['Contact Number:', storePhone],
      ['Reporting Period:', periodLabel],
      ['Statement Currency:', 'PHP (Philippine Peso)'],
      ['Date Generated:', new Date().toLocaleString('en-PH')],
      ['Prepared By:', preparer],
      [],
      ['=== SECTION 1: PROFIT & LOSS PERFORMANCE SUMMARY ==='],
      ['Line Item', 'Amount (PHP)'],
      ...summaryRows.map(([label, val]) => [label, val.toFixed(2)]),
      [],
      ['=== SECTION 2: ITEMIZED TRANSACTION AUDIT LEDGER ==='],
      ['Timestamp', 'Reference ID', 'Type', 'Customer / Payee', 'Category / Order Ref', 'Payment Channel', 'Amount (PHP)', 'Reconciliation Status'],
      ...filteredRows.map(row => [
        new Date(row.date).toLocaleString('en-PH'),
        row.reference,
        row.type,
        row.description,
        row.relatedOrder,
        row.method,
        row.amount.toFixed(2),
        row.status
      ]),
      [],
      ['Total Transaction Count:', filteredRows.length],
      ['Total Volume Value (PHP):', filteredRows.reduce((sum, r) => sum + r.amount, 0).toFixed(2)]
    ];

    const csvContent = '\ufeff' + lines.map(row =>
      row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
    ).join('\r\n');

    downloadFile(csvContent, filename, 'text/csv;charset=utf-8');
    addToast('Financial Report CSV exported', 'success');
  };

  // 2. EXPORT EXCEL (Executive Financial Model Spreadsheet - Branded Pink & Slate)
  const exportExcel = () => {
    setExportOpen(false);
    const filename = `financial-statement-${range.from}-to-${range.to}.xls`;

    const summaryHtml = summaryRows.map(([label, val]) => {
      const isNet = label.includes('Net Operating Profit');
      const isGross = label.includes('Gross Operating Profit');
      return `
        <tr style="height:24px;${isNet ? 'background:#FFF1F5;font-weight:bold;border-top:1.5pt solid #C90052;border-bottom:3pt double #C90052;' : isGross ? 'font-weight:bold;background:#FFF5F8;' : ''}">
          <td style="padding:6px 12px;border:0.5pt solid #FECDD3;font-size:10pt;color:${isNet ? '#9F1239' : '#0F172A'};">${escapeHtml(label)}</td>
          <td style="padding:6px 12px;text-align:right;border:0.5pt solid #FECDD3;font-family:'Consolas','Courier New',monospace;font-size:10pt;color:${val < 0 ? '#DC2626' : isNet ? '#C90052' : '#0F172A'};font-weight:${isNet || isGross ? 'bold' : 'normal'};">
            ${val < 0 ? `(₱${Math.abs(val).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : `₱${val.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </td>
        </tr>
      `;
    }).join('');

    const rowsHtml = filteredRows.map((row, i) => `
      <tr style="height:22px;background:${i % 2 === 0 ? '#FFFFFF' : '#FFF5F8'};">
        <td style="padding:5px 8px;border:0.5pt solid #FECDD3;font-size:9pt;">${escapeHtml(new Date(row.date).toLocaleString('en-PH'))}</td>
        <td style="padding:5px 8px;border:0.5pt solid #FECDD3;font-family:'Consolas',monospace;font-weight:bold;font-size:9pt;color:#9F1239;">${escapeHtml(row.reference)}</td>
        <td style="padding:5px 8px;border:0.5pt solid #FECDD3;text-align:center;font-size:9pt;font-weight:bold;">${escapeHtml(row.type)}</td>
        <td style="padding:5px 8px;border:0.5pt solid #FECDD3;font-size:9pt;">${escapeHtml(row.description)}</td>
        <td style="padding:5px 8px;border:0.5pt solid #FECDD3;font-size:9pt;color:#64748B;">${escapeHtml(row.relatedOrder || '—')}</td>
        <td style="padding:5px 8px;border:0.5pt solid #FECDD3;font-size:9pt;color:#475569;">${escapeHtml(row.method)}</td>
        <td style="padding:5px 8px;border:0.5pt solid #FECDD3;text-align:right;font-family:'Consolas',monospace;font-weight:bold;font-size:9pt;color:#C90052;">
          ₱${row.amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
        <td style="padding:5px 8px;border:0.5pt solid #FECDD3;text-align:center;font-size:8.5pt;font-weight:bold;">${escapeHtml(row.status)}</td>
      </tr>
    `).join('');

    const excelHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Financial Statement</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
          <meta http-equiv="content-type" content="text/plain; charset=UTF-8"/>
          <style>
            body { font-family: 'Segoe UI', Calibri, Arial, sans-serif; color: #0F172A; }
            table { border-collapse: collapse; }
          </style>
        </head>
        <body style="padding:24px;">
          <table style="width:100%;margin-bottom:20px;">
            <tr>
              <td colspan="5">
                <div style="font-size:18pt;font-weight:900;color:#C90052;letter-spacing:-0.5px;">${escapeHtml(storeName)}</div>
                <div style="color:#64748B;font-size:9.5pt;margin-top:2px;">${escapeHtml(storeAddress)} · Phone: ${escapeHtml(storePhone)} · Email: ${escapeHtml(storeEmail)}</div>
                <div style="font-size:12pt;font-weight:bold;color:#451323;margin-top:10px;">STATEMENT OF FINANCIAL PERFORMANCE &amp; TRANSACTION AUDIT</div>
                <div style="color:#475569;font-size:9pt;margin-top:2px;">Reporting Range: ${escapeHtml(periodLabel)} | Run Time: ${new Date().toLocaleString('en-PH')} | Prepared by: ${escapeHtml(preparer)}</div>
              </td>
            </tr>
          </table>

          <table style="width:540px;margin-bottom:28px;border:1.5pt solid #C90052;">
            <thead>
              <tr style="background:#C90052;color:#FFFFFF;height:26px;">
                <th style="padding:6px 12px;text-align:left;font-size:10pt;font-weight:bold;">Executive Profit &amp; Loss Breakdown</th>
                <th style="padding:6px 12px;text-align:right;font-size:10pt;font-weight:bold;">Amount (PHP)</th>
              </tr>
            </thead>
            <tbody>
              ${summaryHtml}
            </tbody>
          </table>

          <table style="width:100%;border:1.5pt solid #C90052;">
            <thead>
              <tr style="background:#C90052;color:#FFFFFF;font-weight:bold;font-size:9.5pt;height:26px;">
                <th style="padding:6px 8px;text-align:left;">Timestamp</th>
                <th style="padding:6px 8px;text-align:left;">Reference #</th>
                <th style="padding:6px 8px;text-align:center;">Type</th>
                <th style="padding:6px 8px;text-align:left;">Customer / Payee Particulars</th>
                <th style="padding:6px 8px;text-align:left;">Category / Reference</th>
                <th style="padding:6px 8px;text-align:left;">Payment Channel</th>
                <th style="padding:6px 8px;text-align:right;">Amount (PHP)</th>
                <th style="padding:6px 8px;text-align:center;">Reconciliation Status</th>
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
    addToast('Financial Report Excel workbook exported', 'success');
  };

  // 3. EXPORT DIRECT PDF (Executive Corporate A4 Landscape Statement in Antique Pasabuy Pink)
  const exportPdf = async () => {
    setExportOpen(false);
    const target = document.getElementById('printable-financial-report');
    if (!target) {
      addToast('Document layout not ready for PDF export', 'error');
      return;
    }

    setIsExportingPdf(true);
    addToast('Generating Antique Pasabuy PDF statement...', 'info');

    try {
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `financial-statement-${dateStr}.pdf`;

      const { downloadElementAsPdf } = await import('../../services/pdfExport');
      await downloadElementAsPdf(target, {
        filename,
        orientation: 'landscape',
        format: 'a4',
        paddingMm: 6,
        scale: 2
      });

      addToast('Financial Statement PDF downloaded successfully!', 'success');
    } catch (err: any) {
      console.error('PDF export error:', err);
      addToast('PDF generation issue: ' + (err?.message || 'Check console'), 'error');
    } finally {
      setIsExportingPdf(false);
    }
  };

  // 4. PRINT REPORT (Browser Print Dialog with Automatic Landscape Page Formatting)
  const printReport = () => {
    setExportOpen(false);

    // Inject dedicated @page rule so print preview is instantly Landscape with zero cut-off
    const styleId = '__financial-report-page-style__';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `@page { size: A4 landscape; margin: 8mm; }`;

    document.body.classList.add('printing-financial-report');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing-financial-report');
      if (styleEl) styleEl.textContent = '';
    }, 1500);
  };

  // Executive Branded Financial Statement Document in Antique Pasabuy Pink & Clean Monospace
  const renderPrintDocument = () => (
    <article
      id="printable-financial-report"
      className="hidden print:block bg-white text-slate-900"
      style={{
        fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif",
        lineHeight: 1.35
      }}
    >
      {/* Top Pink Brand Accent Line */}
      <div style={{ height: '5px', background: 'linear-gradient(90deg, #C90052 0%, #E60063 50%, #FF6584 100%)', borderRadius: '2px', marginBottom: '14px' }} />

      {/* Official Header */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          borderBottom: '2px solid #F43F5E',
          paddingBottom: '14px',
          marginBottom: '16px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <img
            src={SHOPPER_LOGO_DATA_URL}
            alt="Entity logo"
            style={{ height: '48px', width: 'auto', objectFit: 'contain' }}
          />
          <div>
            <div style={{ fontSize: '16px', fontWeight: 900, color: '#451323', textTransform: 'uppercase', letterSpacing: '-0.3px' }}>
              {storeName}
            </div>
            <div style={{ fontSize: '10px', color: '#475569', marginTop: '2px' }}>
              {storeAddress}
            </div>
            <div style={{ fontSize: '9.5px', color: '#64748B', marginTop: '1px' }}>
              Tel: {storePhone} · Email: {storeEmail}
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '13px', fontWeight: 900, color: '#C90052', letterSpacing: '0.4px', textTransform: 'uppercase' }}>
            Statement of Financial Performance
          </div>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#881337', marginTop: '2px' }}>
            Period Covered: {periodLabel}
          </div>
          <div style={{ fontSize: '9px', color: '#64748B', marginTop: '2px' }}>
            Document ID: STMT-{range.from.replace(/-/g, '')}-{range.to.replace(/-/g, '')} · Generated: {new Date().toLocaleString('en-PH')}
          </div>
          <div style={{ fontSize: '9px', color: '#64748B' }}>
            Prepared By: <strong style={{ color: '#0F172A' }}>{preparer}</strong>
          </div>
        </div>
      </header>

      {/* Dual Table P&L + Balance / Cash Position Summary */}
      <section style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '14px', marginBottom: '16px' }}>
        {/* Table 1: P&L Statement */}
        <div style={{ border: '1px solid #FECDD3', borderRadius: '6px', overflow: 'hidden' }}>
          <div style={{ background: '#C90052', color: '#FFFFFF', padding: '6px 10px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            I. Statement of Operating Profit &amp; Loss
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9.5px' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid #FCE7EF' }}>
                <td style={{ padding: '5px 10px', color: '#334155' }}>Gross Sales Revenue (Orders Fulfilled)</td>
                <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: 700, fontFamily: 'Consolas, monospace', color: '#0F172A' }}>
                  {peso(currentTotals.sales)}
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid #FCE7EF', background: '#FFF5F8' }}>
                <td style={{ padding: '5px 10px', color: '#334155' }}>Less: Cost of Goods Sold (Procurement)</td>
                <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: 700, fontFamily: 'Consolas, monospace', color: '#64748B' }}>
                  ({peso(currentTotals.cogs)})
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid #FECDD3', background: '#FFF1F5', fontWeight: 800 }}>
                <td style={{ padding: '6px 10px', color: '#9F1239' }}>Gross Operating Margin</td>
                <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'Consolas, monospace', color: '#9F1239' }}>
                  {peso(currentTotals.grossProfit)}
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid #FCE7EF' }}>
                <td style={{ padding: '5px 10px', color: '#334155' }}>Less: Operating &amp; Store Expenses</td>
                <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: 700, fontFamily: 'Consolas, monospace', color: '#DC2626' }}>
                  ({peso(currentTotals.expenses)})
                </td>
              </tr>
              <tr style={{ background: '#FFF1F5', fontWeight: 900, borderTop: '1px solid #C90052', borderBottom: '3px double #C90052' }}>
                <td style={{ padding: '7px 10px', fontSize: '10.5px', color: '#9F1239' }}>NET OPERATING PROFIT / (LOSS)</td>
                <td style={{ padding: '7px 10px', fontSize: '11px', textAlign: 'right', fontFamily: 'Consolas, monospace', color: currentTotals.netProfit < 0 ? '#DC2626' : '#C90052' }}>
                  {peso(currentTotals.netProfit)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Table 2: Working Capital & Position */}
        <div style={{ border: '1px solid #FECDD3', borderRadius: '6px', overflow: 'hidden' }}>
          <div style={{ background: '#A0153E', color: '#FFFFFF', padding: '6px 10px', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            II. Receivables &amp; Collections Position
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9.5px' }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid #FCE7EF' }}>
                <td style={{ padding: '5px 10px', color: '#334155' }}>Total Payments Collected &amp; Received</td>
                <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: 700, fontFamily: 'Consolas, monospace', color: '#0F172A' }}>
                  {peso(currentTotals.collected)}
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid #FCE7EF', background: '#FFF5F8' }}>
                <td style={{ padding: '5px 10px', color: '#334155' }}>Outstanding Accounts Receivable</td>
                <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: 700, fontFamily: 'Consolas, monospace', color: '#D97706' }}>
                  {peso(currentTotals.outstanding)}
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid #FCE7EF' }}>
                <td style={{ padding: '5px 10px', color: '#334155' }}>Total Logged Activity Records</td>
                <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: 700, fontFamily: 'Consolas, monospace' }}>
                  {filteredRows.length} events
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid #FCE7EF', background: '#FFF5F8' }}>
                <td style={{ padding: '5px 10px', color: '#334155' }}>Gross Margin Ratio</td>
                <td style={{ padding: '5px 10px', textAlign: 'right', fontWeight: 700, fontFamily: 'Consolas, monospace', color: '#0F172A' }}>
                  {currentTotals.sales > 0 ? `${((currentTotals.grossProfit / currentTotals.sales) * 100).toFixed(1)}%` : '0.0%'}
                </td>
              </tr>
              <tr style={{ background: '#FFF1F5', fontWeight: 800, borderTop: '1px solid #A0153E', borderBottom: '3px double #A0153E' }}>
                <td style={{ padding: '7px 10px', fontSize: '10px', color: '#881337' }}>Net Operating Margin Ratio</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'Consolas, monospace', color: currentTotals.netProfit < 0 ? '#DC2626' : '#A0153E' }}>
                  {currentTotals.sales > 0 ? `${((currentTotals.netProfit / currentTotals.sales) * 100).toFixed(1)}%` : '0.0%'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Itemized Audit Ledger */}
      <div style={{ marginBottom: '18px' }}>
        <div style={{ fontSize: '10px', fontWeight: 800, color: '#C90052', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>
          III. Itemized Transaction Audit Register
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5px' }}>
          <thead>
            <tr style={{ background: '#C90052', color: '#FFFFFF', fontWeight: 800 }}>
              <th style={{ padding: '5px 6px', textAlign: 'left', border: '0.5pt solid #A0153E' }}>Date &amp; Time</th>
              <th style={{ padding: '5px 6px', textAlign: 'left', border: '0.5pt solid #A0153E' }}>Reference #</th>
              <th style={{ padding: '5px 6px', textAlign: 'center', border: '0.5pt solid #A0153E' }}>Type</th>
              <th style={{ padding: '5px 6px', textAlign: 'left', border: '0.5pt solid #A0153E' }}>Customer / Payee Particulars</th>
              <th style={{ padding: '5px 6px', textAlign: 'left', border: '0.5pt solid #A0153E' }}>Category / Ref</th>
              <th style={{ padding: '5px 6px', textAlign: 'left', border: '0.5pt solid #A0153E' }}>Payment Channel</th>
              <th style={{ padding: '5px 6px', textAlign: 'right', border: '0.5pt solid #A0153E' }}>Amount (PHP)</th>
              <th style={{ padding: '5px 6px', textAlign: 'center', border: '0.5pt solid #A0153E' }}>Reconciliation</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '16px', textAlign: 'center', color: '#94A3B8', border: '0.5pt solid #FECDD3' }}>
                  No transaction events recorded within the specified statement range.
                </td>
              </tr>
            ) : (
              filteredRows.map((row, idx) => (
                <tr key={row.id} style={{ background: idx % 2 === 1 ? '#FFF5F8' : '#FFFFFF' }}>
                  <td style={{ padding: '4px 6px', border: '0.5pt solid #FCE7EF', whiteSpace: 'nowrap' }}>
                    {new Date(row.date).toLocaleString('en-PH')}
                  </td>
                  <td style={{ padding: '4px 6px', border: '0.5pt solid #FCE7EF', fontFamily: 'Consolas, monospace', fontWeight: 700, color: '#9F1239' }}>
                    {row.reference}
                  </td>
                  <td style={{ padding: '4px 6px', border: '0.5pt solid #FCE7EF', textAlign: 'center', fontWeight: 700, fontSize: '8px', textTransform: 'uppercase' }}>
                    {row.type}
                  </td>
                  <td style={{ padding: '4px 6px', border: '0.5pt solid #FCE7EF', fontWeight: 500 }}>
                    {row.description}
                  </td>
                  <td style={{ padding: '4px 6px', border: '0.5pt solid #FCE7EF', color: '#64748B' }}>
                    {row.relatedOrder || '—'}
                  </td>
                  <td style={{ padding: '4px 6px', border: '0.5pt solid #FCE7EF', color: '#475569' }}>
                    {row.method}
                  </td>
                  <td style={{ padding: '4px 6px', border: '0.5pt solid #FCE7EF', textAlign: 'right', fontFamily: 'Consolas, monospace', fontWeight: 700, color: '#C90052' }}>
                    {peso(row.amount)}
                  </td>
                  <td style={{ padding: '4px 6px', border: '0.5pt solid #FCE7EF', textAlign: 'center', fontWeight: 600, fontSize: '7.5px', textTransform: 'uppercase' }}>
                    {row.status}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Official Attestation & Tripartite Sign-off */}
      <footer style={{ borderTop: '1px solid #FECDD3', paddingTop: '12px', marginTop: '16px' }}>
        <div style={{ fontSize: '8px', color: '#64748B', textAlign: 'center', marginBottom: '14px', fontStyle: 'italic' }}>
          "I hereby certify and declare that this Financial Performance Statement and Audit Trail presents an accurate, complete, and verifiable record of all sales, revenues, and expenditures incurred by Antique Pasabuy &amp; Retail for the declared period."
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '30px', textAlign: 'center', fontSize: '9px' }}>
          <div>
            <div style={{ color: '#881337', fontSize: '8.5px', textTransform: 'uppercase', fontWeight: 700 }}>Prepared &amp; Compiled By:</div>
            <div style={{ marginTop: '28px', borderBottom: '1.5px solid #C90052', width: '80%', margin: '28px auto 0' }} />
            <div style={{ fontWeight: 800, color: '#451323', marginTop: '4px' }}>{preparer}</div>
            <div style={{ color: '#64748B', fontSize: '8px' }}>Authorized POS Operator</div>
          </div>

          <div>
            <div style={{ color: '#881337', fontSize: '8.5px', textTransform: 'uppercase', fontWeight: 700 }}>Audited &amp; Reconciled By:</div>
            <div style={{ marginTop: '28px', borderBottom: '1.5px solid #C90052', width: '80%', margin: '28px auto 0' }} />
            <div style={{ fontWeight: 800, color: '#451323', marginTop: '4px' }}>Branch Operations Supervisor</div>
            <div style={{ color: '#64748B', fontSize: '8px' }}>Internal Audit</div>
          </div>

          <div>
            <div style={{ color: '#881337', fontSize: '8.5px', textTransform: 'uppercase', fontWeight: 700 }}>Certified &amp; Approved By:</div>
            <div style={{ marginTop: '28px', borderBottom: '1.5px solid #C90052', width: '80%', margin: '28px auto 0' }} />
            <div style={{ fontWeight: 800, color: '#451323', marginTop: '4px' }}>Proprietor / Executive Management</div>
            <div style={{ color: '#64748B', fontSize: '8px' }}>Antique Pasabuy Operations</div>
          </div>
        </div>
      </footer>
    </article>
  );

  return (
    <div className="financial-report-page space-y-6">
      {/* Hero Header in Rich Burgundy to Antique Pasabuy Pink Gradient */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#451323] via-[#7B113A] to-[#C90052] p-6 text-white shadow-xl print:hidden">
        {/* Subtle decorative circles for depth */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
          <div className="absolute -right-10 -top-20 h-64 w-64 rounded-full border-[30px] border-white/5" />
          <div className="absolute right-28 -bottom-24 h-48 w-48 rounded-full bg-pink-500/15 blur-2xl" />
        </div>

        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-2.5 inline-flex items-center gap-2 rounded-full border border-pink-300/30 bg-white/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-pink-100 backdrop-blur-xs">
              <BarChart3 className="h-3.5 w-3.5 text-pink-200" /> Business Overview
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">Financial Reports</h1>
            <p className="mt-1 text-xs sm:text-sm text-pink-100/90 font-medium max-w-xl">
              A clear view of your sales, costs, collections, and profit.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Period Filter Pill Switcher */}
            <div className="inline-flex rounded-2xl bg-black/25 p-1 text-xs font-semibold backdrop-blur-md border border-white/10">
              {(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'CUSTOM'] as Period[]).map(val => (
                <button
                  key={val}
                  onClick={() => { setPeriod(val); setPage(1); }}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                    period === val
                      ? 'bg-white text-[#C90052] shadow-sm'
                      : 'text-pink-100/85 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {val.charAt(0) + val.slice(1).toLowerCase()}
                </button>
              ))}
            </div>

            {/* Custom Range Selector */}
            {period === 'CUSTOM' && (
              <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-1.5 text-xs text-slate-800 shadow-md">
                <input
                  type="date"
                  value={customFrom}
                  onChange={e => { setCustomFrom(e.target.value); setPage(1); }}
                  className="font-mono text-xs outline-none"
                />
                <span className="text-slate-300">–</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={e => { setCustomTo(e.target.value); setPage(1); }}
                  className="font-mono text-xs outline-none"
                />
              </div>
            )}

            {/* 4-in-1 Export Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setExportOpen(v => !v)}
                disabled={isExportingPdf}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-[#451323] shadow-md hover:bg-pink-50 active:scale-98 transition disabled:opacity-50"
              >
                <Download className={`h-4 w-4 text-[#C90052] ${isExportingPdf ? 'animate-bounce' : ''}`} />
                <span>{isExportingPdf ? 'Generating PDF...' : 'Export Report'}</span>
                <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${exportOpen ? 'rotate-180' : ''}`} />
              </button>

              {exportOpen && (
                <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-1.5 text-[9.5px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 mb-1 flex justify-between">
                    <span>Export Statement</span>
                    <span>{filteredRows.length} Rows</span>
                  </div>

                  <button
                    onClick={exportCsv}
                    className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-slate-50 transition group"
                  >
                    <div className="flex items-center gap-2.5">
                      <FileText className="h-4 w-4 text-slate-500 group-hover:text-slate-800" />
                      <div>
                        <div className="text-xs font-semibold text-slate-800">CSV Spreadsheet</div>
                        <div className="text-[10px] text-slate-400">RFC 4180 raw data file</div>
                      </div>
                    </div>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-mono font-bold text-slate-600">.CSV</span>
                  </button>

                  <button
                    onClick={exportExcel}
                    className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-slate-50 transition group"
                  >
                    <div className="flex items-center gap-2.5">
                      <Table className="h-4 w-4 text-emerald-600 group-hover:text-emerald-700" />
                      <div>
                        <div className="text-xs font-semibold text-slate-800">Excel Workbook</div>
                        <div className="text-[10px] text-slate-400">P&amp;L summary &amp; ledger</div>
                      </div>
                    </div>
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-mono font-bold text-emerald-700">.XLS</span>
                  </button>

                  <button
                    onClick={exportPdf}
                    disabled={isExportingPdf}
                    className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-slate-50 transition group disabled:opacity-50"
                  >
                    <div className="flex items-center gap-2.5">
                      <Download className="h-4 w-4 text-rose-600 group-hover:text-rose-700" />
                      <div>
                        <div className="text-xs font-semibold text-slate-800">Download PDF Statement</div>
                        <div className="text-[10px] text-slate-400">Official statement with logo</div>
                      </div>
                    </div>
                    <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[9px] font-mono font-bold text-rose-700">.PDF</span>
                  </button>

                  <button
                    onClick={printReport}
                    className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-slate-50 transition group border-t border-slate-100 mt-1 pt-1.5"
                  >
                    <div className="flex items-center gap-2.5">
                      <Printer className="h-4 w-4 text-[#C90052] group-hover:text-[#E60063]" />
                      <div>
                        <div className="text-xs font-semibold text-slate-800">Print / Save as PDF</div>
                        <div className="text-[10px] text-slate-400">System landscape preview</div>
                      </div>
                    </div>
                    <span className="rounded bg-pink-50 px-1.5 py-0.5 text-[9px] font-mono font-bold text-[#C90052]">PRINT</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Period Metadata Bar */}
      <div className="flex flex-wrap items-center justify-between rounded-xl border border-slate-200/80 bg-white px-4 py-2.5 text-xs text-slate-600 shadow-2xs print:hidden">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-[#C90052]" />
          <span className="text-[11px] font-medium text-slate-500">Statement Reporting Period:</span>
          <span className="font-bold text-slate-900">{periodLabel}</span>
        </div>
        <div className="text-[11px] text-slate-400">
          Prior Comparison: {new Date(`${previousRange.from}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} – {new Date(`${previousRange.to}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
      </div>

      {!ready ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-xs text-slate-400">
          Reconciling financial ledger records…
        </div>
      ) : (
        <>
          {/* Vibrant Antique Pasabuy Branded Metric Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
            <MetricCard
              label="Total Sales"
              value={currentTotals.sales}
              previous={previousTotals.sales}
              icon={<ShoppingBag className="h-4 w-4" />}
              accent="pink"
              hint="Order totals in this period"
            />
            <MetricCard
              label="Cost of Goods Sold"
              value={currentTotals.cogs}
              previous={previousTotals.cogs}
              icon={<Receipt className="h-4 w-4" />}
              accent="amber"
              hint="Purchased item costs"
            />
            <MetricCard
              label="Gross Profit"
              value={currentTotals.grossProfit}
              previous={previousTotals.grossProfit}
              icon={<TrendingUp className="h-4 w-4" />}
              accent="emerald"
              hint="Sales minus item costs"
            />
            <MetricCard
              label="Net Profit"
              value={currentTotals.netProfit}
              previous={previousTotals.netProfit}
              icon={<DollarSign className="h-4 w-4" />}
              accent={currentTotals.netProfit < 0 ? 'rose' : 'pink'}
              hint="Gross profit minus expenses"
            />
          </div>

          {/* Secondary Financial Indicators */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 print:hidden">
            <MetricCard
              label="Total Expenses"
              value={currentTotals.expenses}
              previous={previousTotals.expenses}
              icon={<Wallet className="h-4 w-4" />}
              accent="rose"
              hint="Recorded operating expenses"
              isExpense
            />
            <MetricCard
              label="Collected Payments"
              value={currentTotals.collected}
              previous={previousTotals.collected}
              icon={<CreditCard className="h-4 w-4" />}
              accent="blue"
              hint="Payment records received in period"
            />
            <MetricCard
              label="Outstanding Payments"
              value={currentTotals.outstanding}
              previous={previousTotals.outstanding}
              icon={<Building2 className="h-4 w-4" />}
              accent="orange"
              hint="Uncollected customer balances"
            />
          </div>

          {/* Income Statement & Period Comparison Section */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 print:hidden">
            {/* P&L Breakdown Table */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
              <div className="border-b border-slate-100 pb-3 mb-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">Statement of Profit &amp; Loss</h3>
                <p className="text-[11px] text-slate-400">Standard accounting performance calculation</p>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-600">Gross Sales Revenue</span>
                  <span className="font-mono font-bold text-slate-900">{peso(currentTotals.sales)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-600">Less: Cost of Goods Sold</span>
                  <span className="font-mono text-slate-500">({peso(currentTotals.cogs)})</span>
                </div>
                <div className="flex justify-between py-1.5 bg-slate-50 px-2 rounded-lg font-bold">
                  <span className="text-slate-800">Gross Operating Profit</span>
                  <span className="font-mono text-slate-900">{peso(currentTotals.grossProfit)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-50">
                  <span className="text-slate-600">Less: Operating Expenses</span>
                  <span className="font-mono text-rose-600">({peso(currentTotals.expenses)})</span>
                </div>
                <div className="flex justify-between py-2 border-t-2 border-b-2 border-slate-900 font-black text-sm mt-3">
                  <span className="text-slate-900 uppercase tracking-tight">Net Profit / (Loss)</span>
                  <span className={`font-mono ${currentTotals.netProfit < 0 ? 'text-rose-600' : 'text-slate-950'}`}>
                    {peso(currentTotals.netProfit)}
                  </span>
                </div>
              </div>
            </div>

            {/* Performance Comparison Visualizer */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs lg:col-span-2">
              <div className="border-b border-slate-100 pb-3 mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">Period Variance Analysis</h3>
                  <p className="text-[11px] text-slate-400">Performance vs previous equal-length timeframe</p>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-semibold">
                  <span className="flex items-center gap-1.5 text-slate-700">
                    <span className="h-2 w-2 rounded-full bg-[#451323]" /> Current Period
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-400">
                    <span className="h-2 w-2 rounded-full bg-slate-300" /> Prior Period
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ModernCompareCard label="Sales Revenue" current={currentTotals.sales} previous={previousTotals.sales} color="#451323" />
                <ModernCompareCard label="Gross Profit" current={currentTotals.grossProfit} previous={previousTotals.grossProfit} color="#059669" />
                <ModernCompareCard label="Operating Expenses" current={currentTotals.expenses} previous={previousTotals.expenses} color="#DC2626" />
                <ModernCompareCard label="Cash Collected" current={currentTotals.collected} previous={previousTotals.collected} color="#2563EB" />
              </div>
            </div>
          </div>

          {/* Transaction Ledger Table */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden print:hidden">
            <div className="border-b border-slate-100 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">Transaction Audit Register</h3>
                <p className="text-[11px] text-slate-400">Chronological transaction events logged in period</p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1); }}
                    placeholder="Search reference, customer..."
                    className="w-56 rounded-lg border border-slate-200 bg-slate-50/50 py-1.5 pl-8 pr-3 text-xs outline-none focus:border-slate-400 focus:bg-white"
                  />
                </div>

                <select
                  value={recordType}
                  onChange={e => { setRecordType(e.target.value as RecordType); setPage(1); }}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none"
                >
                  <option value="ALL">All Event Types</option>
                  <option value="ORDER">Orders</option>
                  <option value="PAYMENT">Payments</option>
                  <option value="EXPENSE">Expenses</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-pink-100 bg-pink-50/60 text-[10px] font-bold uppercase tracking-wider text-[#881337]">
                    <th className="px-4 py-2.5">Timestamp</th>
                    <th className="px-4 py-2.5">Reference ID</th>
                    <th className="px-4 py-2.5 text-center">Type</th>
                    <th className="px-4 py-2.5">Customer / Payee Particulars</th>
                    <th className="px-4 py-2.5">Category / Ref</th>
                    <th className="px-4 py-2.5">Payment Method</th>
                    <th className="px-4 py-2.5 text-right">Amount (PHP)</th>
                    <th className="px-4 py-2.5 text-center">Reconciliation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-xs text-slate-400">
                        No transactions found for the specified period and search filters.
                      </td>
                    </tr>
                  ) : (
                    pageRows.map(row => (
                      <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-2.5 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                          {new Date(row.date).toLocaleString('en-PH')}
                        </td>
                        <td className="px-4 py-2.5 font-mono font-bold text-slate-800">
                          {row.reference}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase ${
                            row.type === 'ORDER' ? 'bg-pink-50 text-[#C90052] border border-pink-200 font-bold' :
                            row.type === 'PAYMENT' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                            'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}>
                            {row.type}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-900 max-w-[200px] truncate">
                          {row.description}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">
                          {row.relatedOrder || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {row.method}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">
                          {peso(row.amount)}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="text-[10px] font-semibold uppercase text-slate-500">
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="border-t border-slate-100 px-4 py-3 flex items-center justify-between text-xs text-slate-500">
              <span>Showing {filteredRows.length ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filteredRows.length)} of ${filteredRows.length} events` : '0 events'}</span>
              <div className="flex items-center gap-1.5">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  className="rounded border border-slate-200 px-2.5 py-1 text-xs font-semibold disabled:opacity-30 hover:bg-slate-50"
                >
                  Prev
                </button>
                <span className="px-2 text-slate-400">Page {page} of {pageCount}</span>
                <button
                  disabled={page >= pageCount}
                  onClick={() => setPage(p => p + 1)}
                  className="rounded border border-slate-200 px-2.5 py-1 text-xs font-semibold disabled:opacity-30 hover:bg-slate-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Portal Mount for Clean Print & PDF Rendering */}
      {createPortal(renderPrintDocument(), document.body)}
    </div>
  );
};

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    if (link.parentNode) link.parentNode.removeChild(link);
    URL.revokeObjectURL(url);
  }, 300);
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

function MetricCard({
  label,
  value,
  previous,
  icon,
  hint,
  accent = 'pink',
  isExpense = false
}: {
  label: string;
  value: number;
  previous: number;
  icon: React.ReactNode;
  hint: string;
  accent?: 'pink' | 'amber' | 'emerald' | 'rose' | 'blue' | 'orange';
  isExpense?: boolean;
}) {
  const styles: Record<string, { icon: string; stripe: string; wash: string; text: string }> = {
    pink: {
      icon: 'border-pink-200 bg-pink-50 text-[#C90052]',
      stripe: '#C90052',
      wash: 'bg-pink-50/30 hover:border-pink-300 hover:shadow-pink-100/50',
      text: 'text-[#C90052]'
    },
    amber: {
      icon: 'border-amber-200 bg-amber-50 text-amber-700',
      stripe: '#F59E0B',
      wash: 'bg-amber-50/25 hover:border-amber-300 hover:shadow-amber-100/50',
      text: 'text-amber-800'
    },
    emerald: {
      icon: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      stripe: '#10B981',
      wash: 'bg-emerald-50/25 hover:border-emerald-300 hover:shadow-emerald-100/50',
      text: 'text-emerald-800'
    },
    rose: {
      icon: 'border-rose-200 bg-rose-50 text-rose-700',
      stripe: '#F43F5E',
      wash: 'bg-rose-50/25 hover:border-rose-300 hover:shadow-rose-100/50',
      text: 'text-rose-700'
    },
    blue: {
      icon: 'border-blue-200 bg-blue-50 text-blue-700',
      stripe: '#3B82F6',
      wash: 'bg-blue-50/25 hover:border-blue-300 hover:shadow-blue-100/50',
      text: 'text-blue-800'
    },
    orange: {
      icon: 'border-orange-200 bg-orange-50 text-orange-700',
      stripe: '#F97316',
      wash: 'bg-orange-50/25 hover:border-orange-300 hover:shadow-orange-100/50',
      text: 'text-orange-800'
    }
  };

  const style = styles[accent] || styles.pink;
  const delta = value - previous;
  const isPositive = isExpense ? delta <= 0 : delta >= 0;

  return (
    <div className={`group relative overflow-hidden rounded-2xl border border-slate-200/90 ${style.wash} bg-white p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md`}>
      <div style={{ backgroundColor: style.stripe }} className="absolute inset-x-0 top-0 h-1.5" />
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
        <span className={`rounded-xl border p-2 transition-transform duration-200 group-hover:scale-105 ${style.icon}`}>
          {icon}
        </span>
      </div>

      <div className="mt-2.5 font-mono text-2xl font-black tracking-tight text-slate-900">
        {peso(value)}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[10px]">
        <span className="text-slate-400">{hint}</span>
        <span className={`inline-flex items-center font-mono font-bold ${
          isPositive ? 'text-emerald-700' : 'text-rose-600'
        }`}>
          {delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {peso(Math.abs(delta))}
        </span>
      </div>
    </div>
  );
}

function ModernCompareCard({
  label,
  current,
  previous,
  color
}: {
  label: string;
  current: number;
  previous: number;
  color: string;
}) {
  const max = Math.max(current, previous, 1);
  const currentPct = Math.max(5, (current / max) * 100);
  const prevPct = Math.max(5, (previous / max) * 100);

  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
      <div className="flex justify-between items-center text-xs font-bold text-slate-800 mb-2">
        <span>{label}</span>
        <span className="font-mono text-slate-900">{peso(current)}</span>
      </div>

      <div className="space-y-1.5">
        <div>
          <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
            <div style={{ width: `${currentPct}%`, backgroundColor: color }} className="h-full rounded-full" />
          </div>
        </div>
        <div className="flex justify-between text-[9px] text-slate-400 font-mono">
          <span>Current: {peso(current)}</span>
          <span>Prior: {peso(previous)}</span>
        </div>
      </div>
    </div>
  );
}
