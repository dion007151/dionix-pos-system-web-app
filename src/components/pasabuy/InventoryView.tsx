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
  const [filterLowStockOnly, setFilterLowStockOnly] = useState<boolean>(false);

  // Modals
  const [showRestockModal, setShowRestockModal] = useState<boolean>(false);
  const [showAdjustModal, setShowAdjustModal] = useState<boolean>(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Form Fields
  const [addQty, setAddQty] = useState<string>('');
  const [restockNote, setRestockNote] = useState<string>('Restock: Delivery from wholesale');

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
    p => (p.stockQuantity || 0) <= (p.minStockLevel || 5)
  );
  const totalStockValue = stockProducts.reduce(
    (sum, p) => sum + (p.stockQuantity || 0) * (p.costPrice || p.price),
    0
  );

  // Filter products
  const filteredProducts = stockProducts.filter(p => {
    const matchesSearch =
      !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesLowStock = !filterLowStockOnly || (p.stockQuantity || 0) <= (p.minStockLevel || 5);
    return matchesSearch && matchesLowStock;
  });

  // Open Restock Modal
  const handleOpenRestock = (product?: Product) => {
    setSelectedProduct(product || stockProducts[0] || null);
    setAddQty('');
    setRestockNote('Restock: Delivery from wholesale');
    setShowRestockModal(true);
  };

  const handleConfirmRestock = async () => {
    if (!selectedProduct) return;
    const qty = parseFloat(addQty);
    if (isNaN(qty) || qty <= 0) {
      addToast('Please enter a valid positive quantity', 'error');
      return;
    }

    try {
      await addStock(selectedProduct.id, qty, restockNote);
      addToast(`Restocked +${qty} ${selectedProduct.unit} for "${selectedProduct.name}"`, 'success');
      setShowRestockModal(false);
    } catch (err: any) {
      addToast(err.message || 'Failed to add stock', 'error');
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
      addToast('A reason note is required for adjustments (e.g. damaged, count discrepancy)', 'error');
      return;
    }

    try {
      await adjustStock(selectedProduct.id, qty, adjustNote);
      addToast(`Adjusted "${selectedProduct.name}" stock to ${qty}`, 'success');
      setShowAdjustModal(false);
    } catch (err: any) {
      addToast(err.message || 'Failed to adjust stock', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Boxes className="w-5 h-5 text-purple-700" />
            <span>Pasabuy On-Hand Inventory</span>
          </h2>
          <p className="text-xs text-slate-500">
            Real-time stock reconciliation, restock audits, and low-stock alerts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleOpenRestock()}
            disabled={stockProducts.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#452B86] hover:bg-[#5B43E8] disabled:opacity-50 rounded-xl shadow-xs transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>+ Restock Inventory</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Tracked Products */}
        <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Tracked Products</span>
            <div className="p-2 bg-purple-50 rounded-xl text-purple-700">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">
            {totalStockedProducts}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">Kept in on-hand inventory</p>
        </div>

        {/* Units On Hand */}
        <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Units On-Hand</span>
            <div className="p-2 bg-emerald-50 rounded-xl text-emerald-700">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-700">
            {totalUnitsOnHand}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">Available for direct order dispatch</p>
        </div>

        {/* Low Stock Alerts */}
        <div
          onClick={() => setFilterLowStockOnly(!filterLowStockOnly)}
          className={`p-4 border rounded-2xl shadow-xs cursor-pointer transition-all ${
            lowStockItems.length > 0
              ? 'bg-amber-50/50 border-amber-200 hover:border-amber-400'
              : 'bg-white border-slate-200/80'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Low Stock Alerts</span>
            <div className="p-2 bg-amber-100 rounded-xl text-amber-800">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-amber-800">
            {lowStockItems.length}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {filterLowStockOnly ? 'Showing low stock items only' : 'Click to filter low stock items'}
          </p>
        </div>

        {/* Stock Asset Value */}
        <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Inventory Asset Value</span>
            <div className="p-2 bg-blue-50 rounded-xl text-blue-700">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">
            ₱{totalStockValue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">Estimated on-hand capital value</p>
        </div>
      </div>

      {/* Tab Switcher & Search Bar */}
      <div className="bg-white p-3.5 border border-slate-200/80 rounded-2xl shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 bg-slate-100 p-0.5 rounded-xl text-xs font-bold w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('STOCK')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg transition-all ${
              activeTab === 'STOCK'
                ? 'bg-white text-purple-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Boxes className="w-4 h-4" />
            <span>Stock Reconciliation</span>
          </button>
          <button
            onClick={() => setActiveTab('LOGS')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg transition-all ${
              activeTab === 'LOGS'
                ? 'bg-white text-purple-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Movements Audit Log ({movements?.length || 0})</span>
          </button>
        </div>

        {activeTab === 'STOCK' && (
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
        )}
      </div>

      {/* Tab 1: Stock Reconciliation Table */}
      {activeTab === 'STOCK' && (
        <div className="overflow-hidden bg-white border border-slate-200/80 rounded-2xl shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/75 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="px-5 py-3">Product Name</th>
                  <th className="px-5 py-3 text-center">Opening</th>
                  <th className="px-5 py-3 text-center">Received (+)</th>
                  <th className="px-5 py-3 text-center">Total Stock</th>
                  <th className="px-5 py-3 text-center">Sold / Dispatched</th>
                  <th className="px-5 py-3 text-center">Current On-Hand</th>
                  <th className="px-5 py-3 text-center">Status</th>
                  <th className="px-5 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-8 text-center text-slate-400">
                      No products found. To track stock, edit a product in Products and set "Stock Item: Yes".
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map(p => {
                    const opening = p.openingStock || 0;
                    const additional = p.additionalStocks || 0;
                    const total = opening + additional;
                    const onHand = p.stockQuantity || 0;
                    const sold = Math.max(0, total - onHand);
                    const minLevel = p.minStockLevel || 5;

                    const isOutOfStock = onHand <= 0;
                    const isLowStock = onHand <= minLevel && !isOutOfStock;

                    return (
                      <tr key={p.id} className="hover:bg-slate-50/50">
                        <td className="px-5 py-3.5">
                          <span className="font-bold text-slate-900 block">{p.name}</span>
                          <span className="text-[10px] text-slate-400">
                            {p.category} · {p.store} · ₱{p.price.toFixed(2)}/{p.unit}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center font-mono font-semibold text-slate-500">
                          {opening}
                        </td>
                        <td className="px-5 py-3.5 text-center font-mono font-bold text-purple-700">
                          +{additional}
                        </td>
                        <td className="px-5 py-3.5 text-center font-mono font-bold text-slate-800">
                          {total}
                        </td>
                        <td className="px-5 py-3.5 text-center font-mono font-bold text-rose-600">
                          {sold}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <span
                            className={`font-mono text-sm font-black ${
                              isOutOfStock
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
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isOutOfStock
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
                              className="px-2.5 py-1 text-[11px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
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

      {/* Tab 2: Stock Movements Audit Trail */}
      {activeTab === 'LOGS' && (
        <div className="overflow-hidden bg-white border border-slate-200/80 rounded-2xl shadow-xs">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h3 className="font-bold text-xs text-slate-900">Inventory Movement History</h3>
            <p className="text-[11px] text-slate-400">
              Audited record of additions, order dispatches, and manual count corrections
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/75 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="px-5 py-3">Date / Time</th>
                  <th className="px-5 py-3">Product Name</th>
                  <th className="px-5 py-3 text-center">Change</th>
                  <th className="px-5 py-3 text-center">New Balance</th>
                  <th className="px-5 py-3">Reason Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {!movements || movements.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                      No stock movement audit records logged yet.
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
                        <td className="px-5 py-3 text-center">
                          <span
                            className={`inline-flex items-center gap-0.5 font-mono font-bold text-xs ${
                              isPositive ? 'text-emerald-700' : 'text-rose-600'
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

      {/* Restock Modal */}
      {showRestockModal && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5 border border-slate-200 space-y-4">
            <div>
              <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider">
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
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowRestockModal(false)}
                className="flex-1 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRestock}
                className="flex-1 py-2.5 text-xs font-bold text-white bg-[#452B86] rounded-xl hover:bg-[#5B43E8] shadow-xs"
              >
                Confirm Restock
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
                Adjust Physical Stock Count
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
                  Actual Physical Quantity on Hand *
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
                  Mandatory Reason Note *
                </label>
                <input
                  type="text"
                  value={adjustNote}
                  onChange={e => setAdjustNote(e.target.value)}
                  placeholder="e.g. 2 damaged packs, inventory discrepancy"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAdjustModal(false)}
                className="flex-1 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAdjust}
                className="flex-1 py-2.5 text-xs font-bold text-white bg-amber-600 rounded-xl hover:bg-amber-700 shadow-xs"
              >
                Save Adjustment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
