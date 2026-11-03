import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Archive, ChevronLeft, ChevronRight, Eye, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { db } from '../../db/db';
import { Order, OrderItem } from '../../types';
import { permanentlyDeleteArchivedOrders, restoreArchivedOrder, restoreArchivedOrders } from '../../services/orderDeletion';

const money = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const statusLabel = (value: string) => value.replace(/_/g, ' ');

export const ArchiveView: React.FC = () => {
  const { currentUser, addToast } = useApp();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [archiveSourceFilter, setArchiveSourceFilter] = useState('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [archivedFrom, setArchivedFrom] = useState('');
  const [archivedTo, setArchivedTo] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'order'>('newest');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [restoreTargets, setRestoreTargets] = useState<Order[]>([]);
  const [deleteTargets, setDeleteTargets] = useState<Order[]>([]);
  const [busy, setBusy] = useState(false);

  const orders = useLiveQuery(async () => (await db.orders.toArray()).filter(order => order.isArchived), []);
  const items = useLiveQuery(() => db.orderItems.toArray(), []);
  const payments = useLiveQuery(() => db.payments.toArray(), []);
  const rateTiers = useLiveQuery(() => db.rateTiers.toArray(), []);
  const allItemsByOrder = useMemo(() => {
    const grouped = new Map<string, OrderItem[]>();
    (items || []).forEach(item => grouped.set(item.orderId, [...(grouped.get(item.orderId) || []), item]));
    return grouped;
  }, [items]);
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (orders || []).filter(order => {
      const orderItems = allItemsByOrder.get(order.id) || [];
      if (statusFilter !== 'ALL' && order.status !== statusFilter && !orderItems.some(item => item.status === statusFilter)) return false;
      if (archiveSourceFilter !== 'ALL' && (order.archivedFrom || 'Order List') !== archiveSourceFilter) return false;
      const orderDay = order.createdAt.slice(0, 10);
      const archiveDay = (order.archivedAt || '').slice(0, 10);
      if ((fromDate && orderDay < fromDate) || (toDate && orderDay > toDate)) return false;
      if ((archivedFrom && archiveDay < archivedFrom) || (archivedTo && archiveDay > archivedTo)) return false;
      if (!query) return true;
      const productsAndSuppliers = orderItems.map(item => `${item.productName} ${item.notes || ''} ${item.storeName || ''}`).join(' ');
      return `${order.orderNo} ${order.customerName || ''} ${order.customerPhone || ''} ${order.address || ''} ${productsAndSuppliers}`.toLocaleLowerCase().includes(query);
    }).sort((a, b) => {
      if (sort === 'oldest') return (a.archivedAt || '').localeCompare(b.archivedAt || '');
      if (sort === 'order') return a.orderNo.localeCompare(b.orderNo);
      return (b.archivedAt || '').localeCompare(a.archivedAt || '');
    });
  }, [orders, allItemsByOrder, search, statusFilter, archiveSourceFilter, fromDate, toDate, archivedFrom, archivedTo, sort]);

  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const userRole = currentUser?.role || 'Shopper';
  const by = currentUser?.fullName || currentUser?.username || 'Staff';
  const isManager = userRole === 'Admin' || userRole === 'Staff';

  const confirmRestore = async () => {
    if (!restoreTargets.length || busy) return;
    setBusy(true);
    try {
      if (restoreTargets.length === 1) await restoreArchivedOrder(restoreTargets[0].id, userRole, by);
      else await restoreArchivedOrders(restoreTargets.map(order => order.id), userRole, by);
      const count = restoreTargets.length;
      addToast(count === 1 ? 'Order successfully restored to active records.' : `${count} orders successfully restored to active records.`, 'success');
      setSelectedIds(ids => ids.filter(id => !restoreTargets.some(order => order.id === id)));
      setRestoreTargets([]);
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Unable to restore this order. Please check for duplicate or conflicting records.', 'error');
    } finally { setBusy(false); }
  };

  const confirmPermanentDelete = async () => {
    if (!deleteTargets.length || busy) return;
    setBusy(true);
    try {
      const result = await permanentlyDeleteArchivedOrders(deleteTargets.map(order => order.id), userRole, by);
      addToast(result.count === 1 ? 'Order permanently deleted with all eligible related records.' : `${result.count} orders permanently deleted with all eligible related records.`, 'success');
      setSelectedIds(ids => ids.filter(id => !deleteTargets.some(order => order.id === id)));
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Unable to permanently delete this order. No partial deletion was committed.', 'error');
    } finally {
      setBusy(false);
      setDeleteTargets([]);
    }
  };

  const togglePageSelection = () => {
    const visibleIds = visible.map(order => order.id);
    setSelectedIds(ids => visibleIds.every(id => ids.includes(id)) ? ids.filter(id => !visibleIds.includes(id)) : [...new Set([...ids, ...visibleIds])]);
  };

  return <div className="space-y-5">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="mb-1 flex items-center gap-2 text-pink-800"><Archive className="h-5 w-5" /><span className="text-[10px] font-extrabold uppercase tracking-[0.14em]">Order Management / Archive</span></div><h1 className="text-lg font-bold text-slate-900">Archive</h1><p className="mt-1 text-xs text-slate-500">Restore archived orders or permanently remove eligible records.</p></div>
      <div className="flex flex-wrap items-center gap-2"><span className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700">{orders?.length ?? '…'} archived orders</span>{isManager && <button type="button" onClick={togglePageSelection} disabled={!visible.length || busy} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 disabled:opacity-40">{visible.length && visible.every(order => selectedIds.includes(order.id)) ? 'Unselect page' : 'Select page'}</button>}{isManager && <button type="button" disabled={!selectedIds.length || busy} onClick={() => setRestoreTargets((orders || []).filter(order => selectedIds.includes(order.id)))} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5" />Restore ({selectedIds.length})</button>}{userRole === 'Admin' && <button type="button" disabled={!selectedIds.length || busy} onClick={() => setDeleteTargets((orders || []).filter(order => selectedIds.includes(order.id)))} className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" />Permanently Delete ({selectedIds.length})</button>}</div>
    </header>

    <section className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
      <label className="relative sm:col-span-2"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Search order, product, customer, supplier…" className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-xs outline-none focus:border-pink-300" /></label>
      <select aria-label="Original status" value={statusFilter} onChange={event => { setStatusFilter(event.target.value); setPage(1); }} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs"><option value="ALL">All original statuses</option>{['WAITING_CONFIRMATION','READY_TO_BUY','BUYING_NOW','BOUGHT','COMPLETED','CANCELLED','PENDING','PURCHASED','BOUGHT_FROM_STOCK','REORDER','UNAVAILABLE','BACKORDER','ALTERNATIVE_SELECTED','AVAILABLE_AGAIN'].map(status => <option key={status} value={status}>{statusLabel(status)}</option>)}</select>
      <select aria-label="Archived from" value={archiveSourceFilter} onChange={event => setArchiveSourceFilter(event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs"><option value="ALL">All archive sources</option><option value="Order List">Order List</option><option value="Live Buying List">Live Buying List</option></select>
      <select aria-label="Sort archived orders" value={sort} onChange={event => setSort(event.target.value as typeof sort)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs"><option value="newest">Newest archived</option><option value="oldest">Oldest archived</option><option value="order">Order number</option></select>
      <label className="text-[9px] font-bold text-slate-500">Order date from<input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} className="mt-1 block h-9 w-full rounded-lg border border-slate-200 px-2 text-xs" /></label>
      <label className="text-[9px] font-bold text-slate-500">Order date to<input type="date" value={toDate} onChange={event => setToDate(event.target.value)} className="mt-1 block h-9 w-full rounded-lg border border-slate-200 px-2 text-xs" /></label>
      <label className="text-[9px] font-bold text-slate-500">Archived from<input type="date" value={archivedFrom} onChange={event => setArchivedFrom(event.target.value)} className="mt-1 block h-9 w-full rounded-lg border border-slate-200 px-2 text-xs" /></label>
      <label className="text-[9px] font-bold text-slate-500">Archived to<input type="date" value={archivedTo} onChange={event => setArchivedTo(event.target.value)} className="mt-1 block h-9 w-full rounded-lg border border-slate-200 px-2 text-xs" /></label>
    </section>

    {!orders || !items || !payments || !rateTiers ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-xs text-slate-500">Loading archived orders…</div> : filtered.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center"><Archive className="mx-auto mb-2 h-9 w-9 text-slate-300" /><h2 className="text-sm font-bold text-slate-700">No archived orders found</h2><p className="mt-1 text-xs text-slate-500">Try changing your search or filters.</p></div> : <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 text-[10px] text-slate-500"><span><strong className="text-slate-800">{filtered.length}</strong> archived orders</span><span>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)}</span></div>
      <div className="hidden overflow-x-auto xl:block"><table className="w-full min-w-[1500px] text-left text-[10px]"><thead className="bg-slate-50 text-[9px] font-extrabold uppercase tracking-wide text-slate-500"><tr><th className="w-10 px-3 py-3"><input type="checkbox" aria-label="Select page" checked={visible.length > 0 && visible.every(order => selectedIds.includes(order.id))} onChange={togglePageSelection} className="accent-pink-700" /></th><th className="px-3 py-3">Order Number</th><th className="px-3 py-3">Product / Item</th><th className="px-3 py-3">Customer / Supplier</th><th className="px-3 py-3">Quantity</th><th className="px-3 py-3">Original Status</th><th className="px-3 py-3">Order Date</th><th className="px-3 py-3">Date Archived</th><th className="px-3 py-3">Archived From</th><th className="px-3 py-3">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{visible.map(order => { const orderItems = allItemsByOrder.get(order.id) || []; const source = order.archivedFrom || 'Order List'; return <tr key={order.id} className="align-top hover:bg-pink-50/30"><td className="px-3 py-3"><input type="checkbox" aria-label={`Select ${order.orderNo}`} checked={selectedIds.includes(order.id)} onChange={event => setSelectedIds(ids => event.target.checked ? [...ids, order.id] : ids.filter(id => id !== order.id))} className="accent-pink-700" /></td><td className="px-3 py-3 font-mono font-bold text-[#451323]">{order.orderNo}</td><td className="px-3 py-3"><div className="space-y-1">{orderItems.length ? orderItems.map(item => <div key={item.id} className="max-w-64 break-words">{item.productName} <span className="text-slate-400">· {statusLabel(item.status)}</span></div>) : 'No item details'}</div></td><td className="px-3 py-3"><div className="font-semibold text-slate-700">{order.customerName || 'Walk-in Customer'}</div><div className="mt-1 space-y-0.5 text-slate-500">{[...new Set(orderItems.map(item => item.storeName).filter(Boolean))].join(', ') || '—'}</div></td><td className="px-3 py-3">{orderItems.map(item => <div key={item.id}>{item.qty} {item.unit}</div>)}</td><td className="px-3 py-3"><span className="inline-flex rounded-full bg-slate-100 px-2 py-1 font-bold text-slate-700">{statusLabel(order.status)}</span></td><td className="px-3 py-3 whitespace-nowrap">{new Date(order.createdAt).toLocaleString('en-PH')}</td><td className="px-3 py-3 whitespace-nowrap">{order.archivedAt ? new Date(order.archivedAt).toLocaleString('en-PH') : '—'}<small className="mt-1 block text-slate-400">{order.archivedBy || 'Staff'}</small></td><td className="px-3 py-3">{source}</td><td className="px-3 py-3"><div className="flex items-center gap-1.5"><button type="button" onClick={() => setDetailOrder(order)} title="View details" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><Eye className="h-3.5 w-3.5" /></button>{isManager && <button type="button" disabled={busy} onClick={() => setRestoreTargets([order])} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-2 font-bold text-white disabled:opacity-50"><RotateCcw className="h-3 w-3" />Restore</button>}{userRole === 'Admin' && <button type="button" disabled={busy} onClick={() => setDeleteTargets([order])} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-2 font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"><Trash2 className="h-3 w-3" /><span>Permanently Delete</span></button>}</div></td></tr>; })}</tbody></table></div>
      <div className="space-y-3 p-3 xl:hidden">{visible.map(order => { const orderItems = allItemsByOrder.get(order.id) || []; return <article key={order.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-start gap-3"><input type="checkbox" aria-label={`Select ${order.orderNo}`} checked={selectedIds.includes(order.id)} onChange={event => setSelectedIds(ids => event.target.checked ? [...ids, order.id] : ids.filter(id => id !== order.id))} className="mt-1 accent-pink-700" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="font-mono text-[11px] text-[#451323]">{order.orderNo}</strong><span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-600">{statusLabel(order.status)}</span></div><p className="mt-1 text-[10px] text-slate-600">{order.customerName || 'Walk-in Customer'} · {order.archivedFrom || 'Order List'}</p><div className="mt-2 space-y-1">{orderItems.map(item => <div key={item.id} className="text-[10px] text-slate-700">{item.productName} · {item.qty} {item.unit} · {statusLabel(item.status)}{item.storeName ? ` · ${item.storeName}` : ''}</div>)}</div><p className="mt-2 text-[9px] text-slate-500">Order {new Date(order.createdAt).toLocaleString('en-PH')} · Archived {order.archivedAt ? new Date(order.archivedAt).toLocaleString('en-PH') : '—'}</p><div className="mt-3 flex flex-wrap gap-1.5"><button type="button" onClick={() => setDetailOrder(order)} className="rounded-lg border border-slate-200 px-2.5 py-2 text-[10px] font-bold text-slate-600">Details</button>{isManager && <button type="button" disabled={busy} onClick={() => setRestoreTargets([order])} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-2 text-[10px] font-bold text-white"><RotateCcw className="h-3 w-3" />Restore</button>}{userRole === 'Admin' && <button type="button" disabled={busy} onClick={() => setDeleteTargets([order])} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-2 text-[10px] font-bold text-red-700"><Trash2 className="h-3 w-3" />Permanently Delete</button>}</div></div></div></article>; })}</div>
      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-[10px] text-slate-500"><span>Page {page} of {pageCount}</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" />Previous</button><button disabled={page >= pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 disabled:opacity-40">Next<ChevronRight className="h-3.5 w-3.5" /></button></div></div>
    </section>}

    {detailOrder && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setDetailOrder(null); }}><section role="dialog" aria-modal="true" aria-labelledby="archived-order-details-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between"><div><h2 id="archived-order-details-title" className="text-sm font-extrabold text-slate-900">{detailOrder.orderNo}</h2><p className="mt-1 text-xs text-slate-500">Archived {detailOrder.archivedAt && new Date(detailOrder.archivedAt).toLocaleString('en-PH')} by {detailOrder.archivedBy || 'Staff'}</p></div><button onClick={() => setDetailOrder(null)} aria-label="Close details" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button></div><div className="mt-4 grid gap-2 text-xs sm:grid-cols-2"><p>Customer: <strong>{detailOrder.customerName || 'Walk-in Customer'}</strong></p><p>Phone: <strong>{detailOrder.customerPhone || '—'}</strong></p><p>Status: <strong>{statusLabel(detailOrder.status)}</strong></p><p>Archived from: <strong>{detailOrder.archivedFrom || 'Order List'}</strong></p><p>Order date: <strong>{new Date(detailOrder.createdAt).toLocaleString('en-PH')}</strong></p><p>Address: <strong>{detailOrder.address || '—'}</strong></p><p>Notes: <strong>{detailOrder.notes || '—'}</strong></p></div><div className="mt-4 divide-y rounded-xl border border-slate-100">{(allItemsByOrder.get(detailOrder.id) || []).map(item => <div key={item.id} className="flex justify-between gap-3 p-3 text-xs"><span>{item.qty} {item.unit} × {item.productName}<small className="block text-slate-500">{item.storeName || 'Supplier not recorded'} · {item.notes || 'No notes'} · {statusLabel(item.status)}</small></span><strong>{money(item.qty * (item.actualPrice ?? item.estimatedPrice))}</strong></div>)}</div><div className="mt-4 space-y-2"><h3 className="text-[10px] font-extrabold uppercase text-slate-500">Payments retained with the order</h3>{(payments || []).filter(payment => payment.orderId === detailOrder.id).map(payment => <div key={payment.id} className="flex justify-between rounded-lg bg-slate-50 p-2 text-[10px]"><span>{payment.referenceNo || payment.id} · {payment.method} · {new Date(payment.paymentDate).toLocaleString('en-PH')}</span><strong>{money(payment.amount)}</strong></div>)}{!(payments || []).some(payment => payment.orderId === detailOrder.id) && <p className="text-[10px] text-slate-500">No payments recorded.</p>}</div></section></div>}

    {!!restoreTargets.length && <ConfirmDialog title={restoreTargets.length === 1 ? 'Restore Archived Order?' : `Restore ${restoreTargets.length} Archived Orders?`} warning={<>Are you sure you want to restore {restoreTargets.length === 1 ? 'this order' : 'these orders'}? It will return to your active order records with its original details and status.</>} records={restoreTargets} allItemsByOrder={allItemsByOrder} confirmLabel="Confirm Restore" busy={busy} onCancel={() => setRestoreTargets([])} onConfirm={() => void confirmRestore()} />}
    {!!deleteTargets.length && <ConfirmDialog title={deleteTargets.length === 1 ? 'Permanently Delete Archived Order?' : `Permanently Delete ${deleteTargets.length} Archived Orders?`} warning={<>This action will permanently erase the selected archived order and all eligible order-specific records from the database. This action cannot be undone, and the order cannot be restored through the POS application.{deleteTargets.length > 1 && <strong className="mt-1 block">Selected orders: {deleteTargets.length}</strong>}</>} records={deleteTargets} allItemsByOrder={allItemsByOrder} confirmLabel="Yes, Permanently Delete" danger busy={busy} onCancel={() => setDeleteTargets([])} onConfirm={() => void confirmPermanentDelete()} />}
  </div>;
};

const ConfirmDialog: React.FC<{ title: string; warning: React.ReactNode; records: Order[]; allItemsByOrder: Map<string, OrderItem[]>; confirmLabel: string; danger?: boolean; busy: boolean; onCancel: () => void; onConfirm: () => void }> = ({ title, warning, records, allItemsByOrder, confirmLabel, danger, busy, onCancel, onConfirm }) => <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onCancel(); }}><section role="alertdialog" aria-modal="true" aria-labelledby="archive-confirm-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl"><div className="border-b border-slate-100 px-5 py-4"><h2 id="archive-confirm-title" className={`text-sm font-extrabold ${danger ? 'text-red-700' : 'text-slate-900'}`}>{title}</h2></div><div className="space-y-3 p-5"><p className={`rounded-xl p-3 text-[11px] leading-relaxed ${danger ? 'border border-red-100 bg-red-50 text-red-900' : 'bg-emerald-50 text-emerald-900'}`}>{warning}</p><div className="max-h-56 divide-y overflow-y-auto rounded-xl border border-slate-100">{records.map(order => <div key={order.id} className="px-3 py-2.5 text-[10px]"><div className="flex flex-wrap items-center gap-2"><strong className="font-mono text-[#451323]">{order.orderNo}</strong><span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-600">{statusLabel(order.status)}</span><span className="text-slate-500">{new Date(order.createdAt).toLocaleDateString('en-PH')}</span></div>{(allItemsByOrder.get(order.id) || []).map(item => <div key={item.id} className="mt-1 text-slate-600">{item.productName} · Qty {item.qty} {item.unit} · {statusLabel(item.status)}</div>)}</div>)}</div></div><div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3"><button type="button" onClick={onCancel} disabled={busy} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 disabled:opacity-50">Cancel</button><button type="button" onClick={onConfirm} disabled={busy} className={`rounded-xl px-4 py-2 text-xs font-bold text-white disabled:opacity-50 ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>{busy ? 'Processing…' : confirmLabel}</button></div></section></div>;
