import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, addStock, adjustStock } from '../../db/db';
import {
  Boxes,
  Plus,
  AlertTriangle,
  Search,
  RotateCcw,
  CheckCircle2,
  TrendingDown,
  History,
  Package,
  Layers,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { Product, StockMovement } from '../../types';

export const InventoryView: React.FC = () => {
  const { addToast } = useApp();

  const [activeTab, setActiveTab] = useState<'STOCK' | 'LOGS'>('STOCK');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [stockAlertFilter, setStockAlertFilter] = useState<'ALL' | 'LOW' | 'OUT'>('ALL');

  // Modals
  const [showRestockModal, setShowRestockModal] = useState<boolean>(false);
  const [showAdjustModal, setShowAdjustModal] = useState<boolean>(false);
  const [showNewItemModal, setShowNewItemModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Form Fields
  const [addQty, setAddQty] = useState<string>('');
  const [restockNote, setRestockNote] = useState<string>('Restock: Delivery from wholesale');
  const [supplier, setSupplier] = useState('');
  const [purchaseCost, setPurchaseCost] = useState('');
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10));
  const [isSaving, setIsSaving] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', sku: '', category: '', unit: '', quantity: '0', minimum: '5', cost: '', price: '', supplier: '', description: '' });

  const [newActualQty, setNewActualQty] = useState<string>('');
  const [adjustNote, setAdjustNote] = useState<string>('');

  const products = useLiveQuery(() => db.products.toArray(), []);
  const movements = useLiveQuery(
    () => db.stockMovements.orderBy('timestamp').reverse().toArray(),
    []
  );

  const stockProducts = (products || []).filter(p => p.isStockItem);

  // Metrics
  const totalStockedProducts = stockProducts.length;
  const totalUnitsOnHand = stockProducts.reduce((sum, p) => sum + (p.stockQuantity || 0), 0);
  const lowStockItems = stockProducts.filter(
    p => (p.stockQuantity || 0) <= (p.minStockLevel ?? 5)
  );
  const outOfStockItems = stockProducts.filter(p => (p.stockQuantity || 0) <= 0);
  const totalStockValue = stockProducts.reduce(
    (sum, p) => sum + (p.stockQuantity || 0) * (p.costPrice || p.price),
    0
  );

  // Filter products
  const filteredProducts = stockProducts.filter(p => {
    const matchesSearch =
      !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.barcode || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesLowStock = stockAlertFilter !== 'LOW' || ((p.stockQuantity || 0) > 0 && (p.stockQuantity || 0) <= (p.minStockLevel ?? 5));
    const matchesOutOfStock = stockAlertFilter !== 'OUT' || (p.stockQuantity || 0) <= 0;
    return matchesSearch && matchesLowStock && matchesOutOfStock && (categoryFilter === 'ALL' || p.category === categoryFilter);
  });

  // Open Restock Modal
  const handleOpenRestock = (product?: Product) => {
    setSelectedProduct(product || stockProducts[0] || null);
    setAddQty('');
    setRestockNote('Restock: Delivery from wholesale');
    setSupplier('');
    setPurchaseCost(product?.costPrice != null ? String(product.costPrice) : '');
    setReceivedDate(new Date().toISOString().slice(0, 10));
    setShowRestockModal(true);
  };

  const handleConfirmRestock = async () => {
    if (!selectedProduct) return;
    const qty = parseFloat(addQty);
    if (isNaN(qty) || qty <= 0) {
      addToast('Please enter a valid positive quantity', 'error');
      return;
    }

    const cost = purchaseCost.trim() === '' ? undefined : Number(purchaseCost);
    if (cost !== undefined && (!Number.isFinite(cost) || cost < 0)) {
      addToast('Enter a valid non-negative purchase cost', 'error');
      return;
    }
    if (isSaving) return;
    setIsSaving(true);
    try {
      await addStock(selectedProduct.id, qty, restockNote, { supplier: supplier.trim() || undefined, unitCost: cost, receivedDate, reference: `STI-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}` });
      addToast(`Restocked +${qty} ${selectedProduct.unit} for "${selectedProduct.name}"`, 'success');
      setShowRestockModal(false);
    } catch (err: any) {
      addToast(err.message || 'Failed to add stock', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Open Adjust Modal
  const handleOpenAdjust = (product: Product) => {
    setSelectedProduct(product);
    setNewActualQty(String(product.stockQuantity || 0));
    setAdjustNote('');
    setShowAdjustModal(true);
  };

  const handleConfirmAdjust = async () => {
    if (!selectedProduct) return;
    const qty = parseFloat(newActualQty);
    if (isNaN(qty) || qty < 0) {
      addToast('Stock quantity cannot be negative', 'error');
      return;
    }
    if (!adjustNote.trim()) {
      addToast('Please enter a reason for updating the stock count', 'error');
      return;
    }

    if (isSaving) return;
    setIsSaving(true);
    try {
      await adjustStock(selectedProduct.id, qty, adjustNote);
      addToast(`Adjusted "${selectedProduct.name}" stock to ${qty}`, 'success');
      setShowAdjustModal(false);
    } catch (err: any) {
      addToast(err.message || 'Failed to adjust stock', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const openNewItem = () => {
    setNewItem({ name: '', sku: '', category: '', unit: '', quantity: '0', minimum: '5', cost: '', price: '', supplier: '', description: '' });
    setShowNewItemModal(true);
  };

  const handleCreateInventoryItem = async () => {
    if (isSaving) return;
    const name = newItem.name.trim();
    const sku = newItem.sku.trim();
    const category = newItem.category.trim();
    const unit = newItem.unit.trim();
    const quantity = Number(newItem.quantity);
    const minimum = Number(newItem.minimum);
    const cost = Number(newItem.cost);
    const price = Number(newItem.price);
    if (!name || !category || !unit) {
      addToast('Item name, category, and unit are required', 'error');
      return;
    }
    if (!Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(minimum) || minimum < 0 || !Number.isFinite(cost) || cost < 0 || !Number.isFinite(price) || price < 0) {
      addToast('Enter valid non-negative stock and price values', 'error');
      return;
    }

    setIsSaving(true);
    try {
      await db.transaction('rw', db.products, db.stockMovements, async () => {
        const allProducts = await db.products.toArray();
        const duplicate = allProducts.find(product =>
          (sku && product.barcode?.trim().toLowerCase() === sku.toLowerCase()) ||
          (product.name.trim().toLowerCase() === name.toLowerCase() && product.category.trim().toLowerCase() === category.toLowerCase())
        );
        if (duplicate) throw new Error(`A matching item already exists: ${duplicate.name}${duplicate.barcode ? ` (SKU ${duplicate.barcode})` : ''}`);

        const productId = `p-${crypto.randomUUID()}`;
        const product: Product = {
          id: productId, name, category, store: newItem.supplier.trim() || 'Inventory',
          price, costPrice: cost, unit, barcode: sku || undefined,
          supplier: newItem.supplier.trim() || undefined,
          description: newItem.description.trim() || undefined,
          isStockItem: true, openingStock: quantity, additionalStocks: 0,
          stockQuantity: quantity, minStockLevel: minimum
        };
        await db.products.add(product);
        if (quantity > 0) {
          const reference = `INIT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${productId.slice(-8).toUpperCase()}`;
          await db.stockMovements.add({
            id: `sm-${crypto.randomUUID()}`, productId, productName: name,
            timestamp: new Date().toISOString(), changeQty: quantity, newQuantity: quantity,
            note: 'Initial stock received when item was added', movementType: 'STOCK_IN',
            reference, supplier: newItem.supplier.trim() || undefined, unitCost: cost,
            receivedDate: new Date().toISOString().slice(0, 10)
          });
        }
      });
      addToast(`Added "${name}" to Masterlist and Inventory`, 'success');
      setShowNewItemModal(false);
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Unable to add inventory item', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Boxes className="w-5 h-5 text-pink-700" />
            <span>Pasabuy On-Hand Inventory</span>
          </h2>
          <p className="text-xs text-slate-500">
            Track your available items, log new deliveries, and see what needs a refill.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={openNewItem}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-[#C90052] bg-white border border-pink-200 hover:bg-pink-50 rounded-xl shadow-xs"
          >
            <Plus className="w-4 h-4" /><span>Add New Item</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        {/* Tracked Products */}
        <div className="relative overflow-hidden p-4 bg-white border border-slate-200/80 rounded-2xl shadow-sm transition-shadow hover:shadow-md">
          <div className="absolute inset-x-0 top-0 h-1 bg-pink-500" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Tracked items</span>
            <div className="p-2.5 bg-pink-50 rounded-2xl text-pink-700">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black tracking-tight text-slate-900">
            {totalStockedProducts}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Total products with inventory</p>
        </div>

        {/* Units On Hand */}
        <div className="relative overflow-hidden p-4 bg-white border border-emerald-100 rounded-2xl shadow-sm transition-shadow hover:shadow-md">
          <div className="absolute inset-x-0 top-0 h-1 bg-emerald-500" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Items in stock</span>
            <div className="p-2 bg-emerald-50 rounded-xl text-emerald-700">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black tracking-tight text-emerald-700">
            {totalUnitsOnHand}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Ready to sell or deliver</p>
        </div>

        {/* Low Stock Alerts */}
        <button type="button" aria-pressed={stockAlertFilter === 'LOW'} onClick={() => setStockAlertFilter(stockAlertFilter === 'LOW' ? 'ALL' : 'LOW')} className={`relative overflow-hidden p-4 text-left border rounded-2xl shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${stockAlertFilter === 'LOW' || lowStockItems.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200/80'} ${stockAlertFilter === 'LOW' ? 'ring-2 ring-amber-300' : ''}`}>
          <div className="absolute inset-x-0 top-0 h-1 bg-amber-400" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Low stock</span>
            <div className="p-2 bg-amber-100 rounded-xl text-amber-800">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black tracking-tight text-amber-800">
            {lowStockItems.length}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {stockAlertFilter === 'LOW' ? 'Filtered to low stock · click to clear' : 'Click to view items below minimum'}
          </p>
        </button>

        <button type="button" aria-pressed={stockAlertFilter === 'OUT'} onClick={() => setStockAlertFilter(stockAlertFilter === 'OUT' ? 'ALL' : 'OUT')} className={`relative overflow-hidden p-4 text-left border rounded-2xl shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${stockAlertFilter === 'OUT' || outOfStockItems.length ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200/80'} ${stockAlertFilter === 'OUT' ? 'ring-2 ring-rose-300' : ''}`}>
          <div className="absolute inset-x-0 top-0 h-1 bg-rose-500" />
          <div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-600">Out of stock</span><div className="p-2.5 bg-rose-100 rounded-2xl text-rose-700"><AlertTriangle className="w-4 h-4" /></div></div>
          <div className="mt-3 text-3xl font-black tracking-tight text-rose-700">{outOfStockItems.length}</div>
          <p className="text-[11px] text-slate-500 mt-1">{stockAlertFilter === 'OUT' ? 'Filtered to out of stock · click to clear' : 'Click to see items with zero stock'}</p>
        </button>

        {/* Stock Asset Value */}
        <div className="relative overflow-hidden p-4 bg-white border border-blue-100 rounded-2xl shadow-sm transition-shadow hover:shadow-md">
          <div className="absolute inset-x-0 top-0 h-1 bg-blue-500" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Total stock value</span>
            <div className="p-2 bg-blue-50 rounded-xl text-blue-700">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-black tracking-tight text-slate-900">
            ₱{totalStockValue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Cost value of items on hand</p>
        </div>
      </div>

      {/* Tab Switcher & Search Bar */}
      <div className="bg-white p-3.5 border border-slate-200/80 rounded-2xl shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 bg-slate-100 p-0.5 rounded-xl text-xs font-bold w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('STOCK')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg transition-all ${activeTab === 'STOCK'
                ? 'bg-white text-pink-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
              }`}
          >
            <Boxes className="w-4 h-4" />
            <span>Current Stock List</span>
          </button>
          <button
            onClick={() => setActiveTab('LOGS')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg transition-all ${activeTab === 'LOGS'
                ? 'bg-white text-pink-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
              }`}
          >
            <History className="w-4 h-4" />
            <span>Stock History ({movements?.length || 0})</span>
          </button>
        </div>

        {activeTab === 'STOCK' && (
          <div className="flex w-full sm:w-auto gap-2">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search stocked product..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
              />
            </div>
            <select aria-label="Filter by category" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl">
              <option value="ALL">All categories</option>
              {[...new Set(stockProducts.map(p => p.category).filter(Boolean))].sort().map(category => <option key={category} value={category}>{category}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Tab 1: Stock Reconciliation Table */}
      {activeTab === 'STOCK' && (
        <div className="overflow-hidden bg-white border border-slate-200/80 rounded-2xl shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/75 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="px-5 py-3">Product / SKU</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3 text-center">Starting Stock</th>
                  <th className="px-5 py-3 text-center">Restocked (+)</th>
                  <th className="px-5 py-3 text-center">Total Stock</th>
                  <th className="px-5 py-3 text-center">Sold / Delivered</th>
                  <th className="px-5 py-3 text-center">Alert Level</th>
                  <th className="px-5 py-3 text-right">Cost Price (Puhunan)</th>
                  <th className="px-5 py-3 text-right">Selling Price</th>
                  <th className="px-5 py-3 text-center">Remaining Stock</th>
                  <th className="px-5 py-3 text-center">Status</th>
                  <th className="px-5 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-5 py-8 text-center text-slate-400">
                      No products found. To track stock, edit a product in Products and set "Stock Item: Yes".
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map(p => {
                    const opening = p.openingStock || 0;
                    const additional = p.additionalStocks || 0;
                    const total = opening + additional;
                    const onHand = p.stockQuantity || 0;
                    const productMoves = (movements || []).filter(m => m.productId === p.id);
                    const received = productMoves.filter(m => m.changeQty > 0 && m.movementType !== 'ADJUSTMENT').reduce((sum, m) => sum + m.changeQty, 0);
                    const sold = productMoves.filter(m => m.changeQty < 0 && (m.movementType === 'STOCK_OUT' || !m.movementType)).reduce((sum, m) => sum + Math.abs(m.changeQty), 0);
                    const minLevel = p.minStockLevel ?? 5;

                    const isOutOfStock = onHand <= 0;
                    const isLowStock = onHand <= minLevel && !isOutOfStock;

                    return (
                      <tr key={p.id} className={`hover:bg-slate-50/50 ${isOutOfStock ? 'bg-rose-50/60' : isLowStock ? 'bg-amber-50/40' : ''}`}>
                        <td className="px-5 py-3.5">
                          <span className="font-bold text-slate-900 block">{p.name}</span>
                          <span className="text-[10px] text-slate-400">
                            SKU: {p.barcode || '—'} · {p.store} · {p.unit}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">{p.category || '—'}</td>
                        <td className="px-5 py-3.5 text-center font-mono font-semibold text-slate-500">
                          {opening}
                        </td>
                        <td className="px-5 py-3.5 text-center font-mono font-bold text-pink-700">
                          +{received || additional}
                        </td>
                        <td className="px-5 py-3.5 text-center font-mono font-bold text-slate-800">
                          {total}
                        </td>
                        <td className="px-5 py-3.5 text-center font-mono font-bold text-rose-600">
                          {sold}
                        </td>
                        <td className="px-5 py-3.5 text-center font-mono">{minLevel} {p.unit}</td>
                        <td className="px-5 py-3.5 text-right font-mono">₱{(p.costPrice || 0).toFixed(2)}</td>
                        <td className="px-5 py-3.5 text-right font-mono">₱{p.price.toFixed(2)}</td>
                        <td className="px-5 py-3.5 text-center">
                          <span
                            className={`font-mono text-sm font-black ${isOutOfStock
                                ? 'text-rose-600'
                                : isLowStock
                                  ? 'text-amber-600'
                                  : 'text-emerald-700'
                              }`}
                          >
                            {onHand} {p.unit}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isOutOfStock
                                ? 'bg-rose-100 text-rose-800'
                                : isLowStock
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                          >
                            {isOutOfStock
                              ? 'Out of Stock'
                              : isLowStock
                                ? `Low (≤${minLevel})`
                                : 'In Stock'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenRestock(p)}
                              className="px-2.5 py-1 text-[11px] font-bold text-pink-700 bg-pink-50 hover:bg-pink-100 rounded-lg transition-colors"
                              title="Add more stock"
                            >
                              + Restock
                            </button>
                            <button
                              onClick={() => handleOpenAdjust(p)}
                              className="px-2.5 py-1 text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                              title="Adjust count (damaged, recount)"
                            >
                              Adjust
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
      )}

      {/* Tab 2: Stock Movements History */}
      {activeTab === 'LOGS' && (
        <div className="overflow-hidden bg-white border border-slate-200/80 rounded-2xl shadow-xs">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h3 className="font-bold text-xs text-slate-900">Stock Movement History</h3>
            <p className="text-[11px] text-slate-400">
              Record of items added, sold in orders, and manual count updates
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/75 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="px-5 py-3">Date / Time</th>
                  <th className="px-5 py-3">Product Name</th>
                  <th className="px-5 py-3">Activity / Reference</th>
                  <th className="px-5 py-3 text-center">Change</th>
                  <th className="px-5 py-3 text-center">New Balance</th>
                  <th className="px-5 py-3">Reason / Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {!movements || movements.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                      No stock movement records yet.
                    </td>
                  </tr>
                ) : (
                  movements.map(m => {
                    const isPositive = m.changeQty > 0;

                    return (
                      <tr key={m.id} className="hover:bg-slate-50/50">
                        <td className="px-5 py-3 font-mono text-[11px] text-slate-500">
                          {new Date(m.timestamp).toLocaleString('en-PH', {
                            dateStyle: 'short',
                            timeStyle: 'short'
                          })}
                        </td>
                        <td className="px-5 py-3 font-bold text-slate-900">{m.productName}</td>
                        <td className="px-5 py-3 text-slate-600"><span className="font-semibold">{m.movementType?.replace('_', ' ') || (m.changeQty >= 0 ? 'STOCK IN' : 'STOCK OUT')}</span><div className="text-[10px] text-slate-400">{m.reference || m.orderId || '—'}{m.supplier ? ` · ${m.supplier}` : ''}</div></td>
                        <td className="px-5 py-3 text-center">
                          <span
                            className={`inline-flex items-center gap-0.5 font-mono font-bold text-xs ${isPositive ? 'text-emerald-700' : 'text-rose-600'
                              }`}
                          >
                            {isPositive ? (
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            ) : (
                              <ArrowDownRight className="w-3.5 h-3.5" />
                            )}
                            {isPositive ? `+${m.changeQty}` : m.changeQty}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-center font-mono font-black text-slate-900">
                          {m.newQuantity}
                        </td>
                        <td className="px-5 py-3 text-slate-600">{m.note}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showNewItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs" role="dialog" aria-modal="true" aria-labelledby="new-inventory-item-title">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl p-5 border border-slate-200">
            <div className="mb-4">
              <span className="text-[10px] font-bold text-pink-700 uppercase tracking-wider">Stocking Inventory</span>
              <h3 id="new-inventory-item-title" className="text-lg font-bold text-slate-900 mt-0.5">Add New Item</h3>
              <p className="text-xs text-slate-500">This item will be saved to your product list and inventory.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-slate-700">Item name *<input autoFocus value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })} className="mt-1 w-full px-3 py-2 text-sm font-normal bg-slate-50 border border-slate-200 rounded-xl" placeholder="Product name" /></label>
              <label className="text-xs font-semibold text-slate-700">SKU / Product code<input value={newItem.sku} onChange={e => setNewItem({ ...newItem, sku: e.target.value })} className="mt-1 w-full px-3 py-2 text-sm font-normal bg-slate-50 border border-slate-200 rounded-xl" placeholder="Barcode or SKU" /></label>
              <label className="text-xs font-semibold text-slate-700">Category *<input list="inventory-item-categories" value={newItem.category} onChange={e => setNewItem({ ...newItem, category: e.target.value })} className="mt-1 w-full px-3 py-2 text-sm font-normal bg-slate-50 border border-slate-200 rounded-xl" placeholder="Choose or type a category" /><datalist id="inventory-item-categories">{[...new Set((products || []).map(p => p.category).filter(Boolean))].sort().map(category => <option key={category} value={category} />)}</datalist></label>
              <label className="text-xs font-semibold text-slate-700">Unit (e.g. pc, pack, kg, box) *<input list="inventory-item-units" value={newItem.unit} onChange={e => setNewItem({ ...newItem, unit: e.target.value })} className="mt-1 w-full px-3 py-2 text-sm font-normal bg-slate-50 border border-slate-200 rounded-xl" placeholder="Choose or type a unit" /><datalist id="inventory-item-units">{[...new Set((products || []).map(p => p.unit).filter(Boolean))].sort().map(unit => <option key={unit} value={unit} />)}</datalist></label>
              <label className="text-xs font-semibold text-slate-700">Starting stock quantity<input type="number" min="0" step="any" value={newItem.quantity} onChange={e => setNewItem({ ...newItem, quantity: e.target.value })} className="mt-1 w-full px-3 py-2 text-sm font-normal bg-slate-50 border border-slate-200 rounded-xl" /></label>
              <label className="text-xs font-semibold text-slate-700">Alert me when stock is below<input type="number" min="0" step="any" value={newItem.minimum} onChange={e => setNewItem({ ...newItem, minimum: e.target.value })} className="mt-1 w-full px-3 py-2 text-sm font-normal bg-slate-50 border border-slate-200 rounded-xl" /></label>
              <label className="text-xs font-semibold text-slate-700">Purchase cost per unit (Puhunan)<input type="number" min="0" step="0.01" value={newItem.cost} onChange={e => setNewItem({ ...newItem, cost: e.target.value })} className="mt-1 w-full px-3 py-2 text-sm font-normal bg-slate-50 border border-slate-200 rounded-xl" placeholder="₱0.00" /></label>
              <label className="text-xs font-semibold text-slate-700">Selling price<input type="number" min="0" step="0.01" value={newItem.price} onChange={e => setNewItem({ ...newItem, price: e.target.value })} className="mt-1 w-full px-3 py-2 text-sm font-normal bg-slate-50 border border-slate-200 rounded-xl" placeholder="₱0.00" /></label>
              <label className="text-xs font-semibold text-slate-700 sm:col-span-2">Supplier<input value={newItem.supplier} onChange={e => setNewItem({ ...newItem, supplier: e.target.value })} className="mt-1 w-full px-3 py-2 text-sm font-normal bg-slate-50 border border-slate-200 rounded-xl" placeholder="Supplier name (optional)" /></label>
              <label className="text-xs font-semibold text-slate-700 sm:col-span-2">Description<textarea rows={2} value={newItem.description} onChange={e => setNewItem({ ...newItem, description: e.target.value })} className="mt-1 w-full px-3 py-2 text-sm font-normal bg-slate-50 border border-slate-200 rounded-xl resize-y" placeholder="Optional product description" /></label>
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2 pt-5">
              <button type="button" onClick={() => !isSaving && setShowNewItemModal(false)} disabled={isSaving} className="flex-1 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={handleCreateInventoryItem} disabled={isSaving} className="flex-1 py-2.5 text-xs font-bold text-white bg-[#C90052] rounded-xl hover:bg-[#E60063] shadow-xs disabled:opacity-60">{isSaving ? 'Saving…' : 'Add to Inventory'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Restock Modal */}
      {showRestockModal && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5 border border-slate-200 space-y-4">
            <div>
              <span className="text-[10px] font-bold text-pink-700 uppercase tracking-wider">
                Restock Inventory
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-0.5">
                {selectedProduct.name}
              </h3>
              <p className="text-xs text-slate-500">
                Current on-hand: {selectedProduct.stockQuantity || 0} {selectedProduct.unit}
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Quantity to Add *
                </label>
                <input
                  type="number"
                  min="0.1"
                  step="any"
                  autoFocus
                  value={addQty}
                  onChange={e => setAddQty(e.target.value)}
                  placeholder="e.g. 20"
                  className="w-full px-3 py-2 text-lg font-black text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Supplier / Restock Note
                </label>
                <input
                  type="text"
                  value={restockNote}
                  onChange={e => setRestockNote(e.target.value)}
                  placeholder="e.g. Delivery from SM wholesale, Puregold"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="block text-xs font-semibold text-slate-700 mb-1">Supplier</label><input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Supplier name" className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl" /></div>
                <div><label className="block text-xs font-semibold text-slate-700 mb-1">Purchase cost / unit</label><input type="number" min="0" step="0.01" value={purchaseCost} onChange={e => setPurchaseCost(e.target.value)} placeholder="₱0.00" className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl" /></div>
              </div>
              <div><label className="block text-xs font-semibold text-slate-700 mb-1">Date received</label><input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl" /></div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => !isSaving && setShowRestockModal(false)}
                className="flex-1 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRestock}
                disabled={isSaving}
                className="flex-1 py-2.5 text-xs font-bold text-white bg-[#C90052] rounded-xl hover:bg-[#E60063] shadow-xs"
              >
                {isSaving ? 'Saving…' : 'Confirm Stock In'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Count Modal */}
      {showAdjustModal && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5 border border-slate-200 space-y-4">
            <div>
              <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                Update Stock Count
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-0.5">
                {selectedProduct.name}
              </h3>
              <p className="text-xs text-slate-500">
                System shows: {selectedProduct.stockQuantity || 0} {selectedProduct.unit}
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Actual Count (what you counted in person) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  autoFocus
                  value={newActualQty}
                  onChange={e => setNewActualQty(e.target.value)}
                  className="w-full px-3 py-2 text-lg font-black text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason for update (required) *
                </label>
                <input
                  type="text"
                  value={adjustNote}
                  onChange={e => setAdjustNote(e.target.value)}
                  placeholder="e.g. 2 damaged packs, recount correction, expired"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => !isSaving && setShowAdjustModal(false)}
                className="flex-1 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAdjust}
                disabled={isSaving}
                className="flex-1 py-2.5 text-xs font-bold text-white bg-amber-600 rounded-xl hover:bg-amber-700 shadow-xs"
              >
                {isSaving ? 'Saving…' : 'Save Adjustment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
