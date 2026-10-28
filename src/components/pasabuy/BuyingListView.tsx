import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, recordSaleFromStock } from '../../db/db';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Search,
  Filter,
  DollarSign,
  ShoppingCart,
  Store as StoreIcon,
  Check,
  RotateCcw,
  Boxes
} from 'lucide-react';
import { OrderItem, ItemStatus } from '../../types';
import {
  deriveOrderStatus,
  roundMoney
} from '../../services/calc';

export const BuyingListView: React.FC = () => {
  const { addToast } = useApp();

  const [selectedStore, setSelectedStore] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<ItemStatus | 'ALL'>('PENDING');

  // Purchase Dialog state
  const [itemToPurchase, setItemToPurchase] = useState<OrderItem | null>(null);
  const [actualPriceInput, setActualPriceInput] = useState<string>('');

  const stores = useLiveQuery(() => db.stores.toArray(), []);
  const orders = useLiveQuery(() => db.orders.toArray(), []);
  const orderItems = useLiveQuery(() => db.orderItems.toArray(), []);
  const products = useLiveQuery(() => db.products.toArray(), []);

  // Filter items
  const nonCancelledOrderIds = new Set(
    (orders || []).filter(o => o.status !== 'CANCELLED').map(o => o.id)
  );

  const activeItems = (orderItems || []).filter(i => nonCancelledOrderIds.has(i.orderId));

  const filteredItems = activeItems.filter(item => {
    const matchesStore = selectedStore === 'ALL' || item.storeName === selectedStore;
    const matchesStatus = filterStatus === 'ALL' || item.status === filterStatus;
    const matchesSearch =
      !searchQuery ||
      item.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.storeName && item.storeName.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesStore && matchesStatus && matchesSearch;
  });

  // KPI Calculations
  const pendingItems = activeItems.filter(i => i.status === 'PENDING');
  const purchasedItems = activeItems.filter(
    i => i.status === 'PURCHASED' || i.status === 'BOUGHT_FROM_STOCK'
  );

  const estimatedCapital = pendingItems.reduce(
    (sum, i) => sum + i.qty * (i.estimatedPrice || 0),
    0
  );

  const actualSpent = purchasedItems.reduce(
    (sum, i) => sum + i.qty * (i.actualPrice || i.estimatedPrice || 0),
    0
  );

  // Mark Item as Purchased
  const handleOpenPurchase = (item: OrderItem) => {
    setItemToPurchase(item);
    setActualPriceInput(String(item.actualPrice || item.estimatedPrice || 0));
  };

  const handleConfirmPurchase = async () => {
    if (!itemToPurchase) return;
    const price = parseFloat(actualPriceInput);
    if (isNaN(price) || price < 0) {
      addToast('Please enter a valid price', 'error');
      return;
    }

    const updatedItem: OrderItem = {
      ...itemToPurchase,
      actualPrice: price,
      status: 'PURCHASED',
      purchasedQty: itemToPurchase.qty,
      purchaseDate: new Date().toISOString()
    };

    await db.orderItems.put(updatedItem);

    // Check if parent order status should transition
    const siblingItems = await db.orderItems.where('orderId').equals(itemToPurchase.orderId).toArray();
    const parentOrder = await db.orders.get(itemToPurchase.orderId);
    if (parentOrder && parentOrder.status !== 'CANCELLED' && parentOrder.status !== 'COMPLETED') {
      const newStatus = deriveOrderStatus(false, false, siblingItems);
      if (newStatus !== parentOrder.status) {
        await db.orders.update(parentOrder.id, {
          status: newStatus,
          updatedAt: new Date().toISOString()
        });
      }
    }

    addToast(`Purchased "${itemToPurchase.productName}" for ₱${price.toFixed(2)}`, 'success');
    setItemToPurchase(null);
  };

  // Fulfill from on-hand stock
  const handleFulfillFromStock = async (item: OrderItem) => {
    const parentOrder = (orders || []).find(o => o.id === item.orderId);
    const success = await recordSaleFromStock(
      item.productName,
      item.qty,
      item.orderId,
      parentOrder?.orderNo
    );

    const updatedItem: OrderItem = {
      ...item,
      status: 'BOUGHT_FROM_STOCK',
      actualPrice: item.estimatedPrice,
      purchasedQty: item.qty,
      purchaseDate: new Date().toISOString()
    };

    await db.orderItems.put(updatedItem);

    const siblingItems = await db.orderItems.where('orderId').equals(item.orderId).toArray();
    if (parentOrder && parentOrder.status !== 'CANCELLED' && parentOrder.status !== 'COMPLETED') {
      const derived = deriveOrderStatus(false, false, siblingItems);
      if (derived !== parentOrder.status) {
        await db.orders.update(parentOrder.id, {
          status: derived,
          updatedAt: new Date().toISOString()
        });
      }
    }

    addToast(
      success
        ? `Fulfilled "${item.productName}" from on-hand stock (-${item.qty})`
        : `Marked "${item.productName}" as fulfilled from stock`,
      'success'
    );
  };

  // Mark as Unavailable or Reorder
  const handleSetStatus = async (item: OrderItem, newStatus: ItemStatus) => {
    await db.orderItems.update(item.id, {
      status: newStatus,
      actualPrice: newStatus === 'UNAVAILABLE' ? 0 : item.actualPrice
    });

    const siblingItems = await db.orderItems.where('orderId').equals(item.orderId).toArray();
    const parentOrder = await db.orders.get(item.orderId);
    if (parentOrder && parentOrder.status !== 'CANCELLED' && parentOrder.status !== 'COMPLETED') {
      const derived = deriveOrderStatus(false, false, siblingItems);
      await db.orders.update(parentOrder.id, {
        status: derived,
        updatedAt: new Date().toISOString()
      });
    }

    addToast(`Item marked as ${newStatus}`, 'info');
  };

  return (
    <div className="space-y-5">
      {/* Top Header & Shopping Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-purple-700" />
            <span>Shopper Buying List</span>
          </h2>
          <p className="text-xs text-slate-500">
            Check off items live while in the supermarket or mall in Antique.
          </p>
        </div>

        {/* Quick Summary Pill on Mobile & Tablet */}
        <div className="flex items-center gap-3 bg-white border border-slate-200/80 px-3 py-2 rounded-2xl shadow-xs text-xs">
          <div>
            <span className="text-[10px] text-slate-400 block font-semibold uppercase">Pending</span>
            <span className="font-bold text-amber-600">{pendingItems.length} items</span>
          </div>
          <div className="w-px h-6 bg-slate-200" />
          <div>
            <span className="text-[10px] text-slate-400 block font-semibold uppercase">Est. Capital</span>
            <span className="font-bold text-slate-900">₱{roundMoney(estimatedCapital).toFixed(2)}</span>
          </div>
          <div className="w-px h-6 bg-slate-200" />
          <div>
            <span className="text-[10px] text-slate-400 block font-semibold uppercase">Actual Spent</span>
            <span className="font-bold text-emerald-700">₱{roundMoney(actualSpent).toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Filter Bar (Horizontal Store Badges + Search) */}
      <div className="bg-white p-3.5 border border-slate-200/80 rounded-2xl shadow-xs space-y-3">
        {/* Search & Status Filters */}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search product name or store..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setFilterStatus('PENDING')}
              className={`px-3 py-1 rounded-lg transition-all ${
                filterStatus === 'PENDING'
                  ? 'bg-white text-amber-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              To Buy ({pendingItems.length})
            </button>
            <button
              onClick={() => setFilterStatus('PURCHASED')}
              className={`px-3 py-1 rounded-lg transition-all ${
                filterStatus === 'PURCHASED'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Bought ({purchasedItems.length})
            </button>
            <button
              onClick={() => setFilterStatus('ALL')}
              className={`px-3 py-1 rounded-lg transition-all ${
                filterStatus === 'ALL'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({activeItems.length})
            </button>
          </div>
        </div>

        {/* Store Quick Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 no-scrollbar text-xs">
          <button
            onClick={() => setSelectedStore('ALL')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
              selectedStore === 'ALL'
                ? 'bg-[#452B86] text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>All Stores</span>
          </button>
          {(stores || []).map(s => {
            const count = activeItems.filter(i => i.storeName === s.name && i.status === 'PENDING').length;
            const isSelected = selectedStore === s.name;
            return (
              <button
                key={s.id}
                onClick={() => setSelectedStore(s.name)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-all ${
                  isSelected
                    ? 'bg-[#452B86] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <StoreIcon className="w-3.5 h-3.5" />
                <span>{s.name}</span>
                {count > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      isSelected ? 'bg-white text-purple-900' : 'bg-amber-200 text-amber-900'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Items List (Touch friendly cards for mobile, table on desktop) */}
      <div className="space-y-2.5">
        {filteredItems.length === 0 ? (
          <div className="p-8 text-center bg-white border border-slate-200/80 rounded-2xl">
            <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-80" />
            <h3 className="font-bold text-slate-800 text-sm">No items found</h3>
            <p className="text-xs text-slate-500 mt-1">
              All items in this store/status have been purchased or no orders pending!
            </p>
          </div>
        ) : (
          filteredItems.map(item => {
            const parentOrder = (orders || []).find(o => o.id === item.orderId);
            const isPurchased = item.status === 'PURCHASED' || item.status === 'BOUGHT_FROM_STOCK';
            const isPending = item.status === 'PENDING';
            const price = item.actualPrice !== undefined ? item.actualPrice : item.estimatedPrice;

            const isBoughtFromStock = item.status === 'BOUGHT_FROM_STOCK';
            const matchingStockProduct = (products || []).find(
              p => p.name.trim().toLowerCase() === item.productName.trim().toLowerCase() && p.isStockItem
            );
            const hasStockAvailable = matchingStockProduct && (matchingStockProduct.stockQuantity || 0) >= item.qty;

            return (
              <div
                key={item.id}
                className={`p-4 bg-white border rounded-2xl shadow-xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isPurchased
                    ? 'border-emerald-200 bg-emerald-50/20'
                    : item.status === 'UNAVAILABLE'
                    ? 'border-rose-200 bg-rose-50/20 opacity-70'
                    : 'border-slate-200 hover:border-purple-300'
                }`}
              >
                {/* Left: Product & Store & Order Info */}
                <div className="flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                        isPurchased
                          ? 'bg-emerald-100 text-emerald-800'
                          : isPending
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {item.status.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md">
                      {item.storeName || 'Store'}
                    </span>
                    {hasStockAvailable && isPending && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-800 flex items-center gap-1">
                        <Boxes className="w-3 h-3" />
                        <span>On-Hand Stock: {matchingStockProduct.stockQuantity}</span>
                      </span>
                    )}
                    {parentOrder && (
                      <span className="text-[11px] font-medium text-slate-500">
                        {parentOrder.orderNo} · {parentOrder.customerName}
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 leading-snug">
                    {item.qty}x {item.productName}
                  </h3>

                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span>
                      Est: ₱{item.estimatedPrice.toFixed(2)}/{item.unit}
                    </span>
                    {item.actualPrice !== undefined && (
                      <span className="font-bold text-emerald-700">
                        Actual: ₱{item.actualPrice.toFixed(2)}
                      </span>
                    )}
                    <span className="font-bold text-slate-800">
                      Total: ₱{roundMoney(item.qty * price).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Right: Shopper Action Buttons (Thumb Friendly) */}
                <div className="flex items-center gap-2 self-end sm:self-center">
                  {isPending && (
                    <>
                      {hasStockAvailable && (
                        <button
                          onClick={() => handleFulfillFromStock(item)}
                          className="flex items-center gap-1 px-3 py-2 text-xs font-bold text-purple-800 bg-purple-100 hover:bg-purple-200 rounded-xl shadow-xs transition-all active:scale-95"
                          title="Fulfill directly from on-hand stock and deduct inventory"
                        >
                          <Boxes className="w-3.5 h-3.5 text-purple-700" />
                          <span>From Stock</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleOpenPurchase(item)}
                        className="flex items-center gap-1 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-all active:scale-95"
                      >
                        <Check className="w-4 h-4" />
                        <span>Bought</span>
                      </button>
                      <button
                        onClick={() => handleSetStatus(item, 'UNAVAILABLE')}
                        className="p-2 text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl transition-all"
                        title="Mark Out of Stock / Unavailable"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </>
                  )}

                  {isPurchased && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                        {isBoughtFromStock ? (
                          <>
                            <Boxes className="w-4 h-4 text-purple-700" />
                            <span className="text-purple-700">From Stock</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4" />
                            <span>Purchased</span>
                          </>
                        )}
                      </span>
                      <button
                        onClick={() => handleSetStatus(item, 'PENDING')}
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg text-[11px] flex items-center gap-1"
                        title="Reset to Pending"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Undo</span>
                      </button>
                    </div>
                  )}

                  {item.status === 'UNAVAILABLE' && (
                    <button
                      onClick={() => handleSetStatus(item, 'PENDING')}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl"
                    >
                      Undo
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Actual Price Prompt Modal */}
      {itemToPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5 border border-slate-200 space-y-4">
            <div>
              <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider">
                Confirm Purchase
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-0.5">
                {itemToPurchase.qty}x {itemToPurchase.productName}
              </h3>
              <p className="text-xs text-slate-500">
                Store: {itemToPurchase.storeName} · Est: ₱{itemToPurchase.estimatedPrice.toFixed(2)}
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Actual Purchase Unit Price (₱) *
              </label>
              <input
                type="number"
                min="0"
                step="any"
                autoFocus
                value={actualPriceInput}
                onChange={e => setActualPriceInput(e.target.value)}
                className="w-full px-3 py-2 text-lg font-black text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Total will be: ₱{roundMoney(itemToPurchase.qty * (parseFloat(actualPriceInput) || 0)).toFixed(2)}
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setItemToPurchase(null)}
                className="flex-1 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPurchase}
                className="flex-1 py-2.5 text-xs font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 shadow-xs"
              >
                Confirm Purchased
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
