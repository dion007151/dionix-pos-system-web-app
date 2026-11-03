import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import {
  Minus, Plus, UserPlus, Truck, Building2,
  ShoppingBag, Search, X, Tag, ChevronDown, Save, Phone, MapPin, StickyNote, UserRound, Sparkles
} from 'lucide-react';
import { Order, OrderItem, DeliveryType, ProductFeeType, PaymentMethod } from '../../types';
import { calculateOrderSummary, roundMoney } from '../../services/calc';
import { nextDailyOrderNumber } from '../../services/orderNumber';

interface CartItem {
  id: string;
  productId?: string;
  productName: string;
  imageUrl?: string;
  storeName: string;
  qty: number;
  unit: string;
  estimatedPrice: number;
  feeType: ProductFeeType;
  manualFeeAmount?: number;
  notes?: string;
  maxStock?: number;
}

export const NewOrderView: React.FC = () => {
  const { setActiveView, addToast, openReceiptModal, logUserAction } = useApp();

  const customers = useLiveQuery(() => db.customers.toArray(), []);
  const stores = useLiveQuery(() => db.stores.toArray(), []);
  const products = useLiveQuery(() => db.products.toArray(), []);
  const rateTiers = useLiveQuery(() => db.rateTiers.toArray(), []);

  // --- Cart & Order State ---
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('DELIVERY');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [addressNote, setAddressNote] = useState('');
  const [deliveryTime, setDeliveryTime] = useState('ASAP');
  const [scheduledAt, setScheduledAt] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('COD');
  const [changeFor, setChangeFor] = useState(0);
  const [orderNotes, setOrderNotes] = useState('');
  const [deliveryFee, setDeliveryFee] = useState(50);
  const [discountValue, setDiscountValue] = useState(0);
  const [discountMode, setDiscountMode] = useState<'amount' | 'percent'>('amount');
  const [discountReason, setDiscountReason] = useState('');
  const [additionalFeeValue, setAdditionalFeeValue] = useState(0);
  const [additionalFeeMode, setAdditionalFeeMode] = useState<'FIXED' | 'PERCENT'>('FIXED');
  const [additionalFeeNote, setAdditionalFeeNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // --- UI State ---
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customStore, setCustomStore] = useState('');
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');
  const [showOrderPanel, setShowOrderPanel] = useState(false); // mobile toggle

  const itemSubtotal = cart.reduce((sum, item) => sum + roundMoney(item.qty * item.estimatedPrice), 0);
  const discount = Math.min(itemSubtotal, roundMoney(discountMode === 'percent' ? itemSubtotal * Math.min(discountValue, 100) / 100 : discountValue));

  // --- Categories ---
  const categories = useMemo(() => {
    const cats = Array.from(new Set((products || []).map(p => p.category).filter(Boolean)));
    return ['All', ...cats];
  }, [products]);

  // --- Filtered Products ---
  const filteredProducts = useMemo(() => {
    return (products || []).filter(p => {
      const matchCat = selectedCategory === 'All' || p.category === selectedCategory;
      const query = searchQuery.trim().toLowerCase();
      const matchSearch = !query ||
        p.name.toLowerCase().includes(query) ||
        p.store?.toLowerCase().includes(query) ||
        p.barcode?.toLowerCase().includes(query);
      return matchCat && matchSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  // --- Cart Operations ---
  const addToCart = (product: { id?: string; name: string; store?: string; price: number; unit?: string; feeType?: ProductFeeType; maxStock?: number; imageUrl?: string }) => {
    const existingIdx = cart.findIndex(c => c.productId === product.id && product.id);
    if (existingIdx >= 0) {
      const current = cart[existingIdx];
      if (current.maxStock != null && current.qty >= current.maxStock) {
        addToast(`Only ${current.maxStock} ${current.unit} available`, 'info');
        return;
      }
      setCart(prev => prev.map((item, i) =>
        i === existingIdx ? { ...item, qty: item.qty + 1 } : item
      ));
    } else {
      const newItem: CartItem = {
        id: Math.random().toString(36).substring(2, 9),
        productId: product.id,
        productName: product.name,
        imageUrl: product.imageUrl,
        storeName: product.store || (stores && stores[0]?.name) || 'Store',
        qty: 1,
        unit: product.unit || 'pc',
        estimatedPrice: product.price,
        feeType: product.feeType || 'STANDARD',
        maxStock: product.maxStock,
      };
      setCart(prev => [...prev, newItem]);
    }
  };

  const updateQty = (id: string, delta: number) => {
    setCart(prev => prev
      .map(item => item.id === id ? { ...item, qty: Math.min(item.maxStock ?? Infinity, Math.max(0.5, +(item.qty + delta).toFixed(1))) } : item)
    );
  };

  const setItemQty = (id: string, quantity: number) => setCart(prev => prev.map(item => item.id === id
    ? { ...item, qty: Math.min(item.maxStock ?? Infinity, Math.max(0.5, quantity || 0.5)) }
    : item));

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const updateItemNotes = (id: string, notes: string) => setCart(prev => prev.map(item => item.id === id ? { ...item, notes } : item));
  const restoreItem = (item: CartItem) => setCart(prev => [...prev, item]);

  const clearCart = () => setCart([]);

  // --- Custom Item ---
  const handleAddCustomItem = () => {
    if (!customName.trim()) { addToast('Enter item name', 'error'); return; }
    if (!Number.isFinite(Number(customPrice)) || Number(customPrice) <= 0) { addToast('Enter a valid item price', 'error'); return; }
    addToCart({
      name: customName.trim(),
      store: customStore || (stores && stores[0]?.name) || 'Store',
      price: parseFloat(customPrice),
      feeType: 'STANDARD',
    });
    setCustomName('');
    setCustomPrice('');
    setShowCustomInput(false);
  };

  // --- Summary Calculation ---
  const calculatedItems: OrderItem[] = cart.map(item => ({
    id: item.id,
    orderId: 'temp',
    productName: item.productName,
    storeName: item.storeName,
    qty: item.qty,
    unit: item.unit,
    estimatedPrice: item.estimatedPrice,
    status: 'PENDING',
    feeType: item.feeType,
    manualFeeAmount: item.manualFeeAmount,
    notes: item.notes,
  }));

  const summary = calculateOrderSummary(
    {
      items: calculatedItems,
      deliveryFee: deliveryType === 'DELIVERY' ? deliveryFee : 0,
      discount,
    },
    rateTiers,
    { mode: additionalFeeMode, value: additionalFeeValue }
  );

  // --- Customer ---
  const handleCustomerChange = (id: string) => {
    setSelectedCustomerId(id);
    const cust = customers?.find(c => c.id === id);
    if (cust && deliveryType === 'DELIVERY') {
      setDeliveryAddress(cust.address || '');
      setAddressNote(cust.notes || '');
    } else if (!id && deliveryType === 'DELIVERY') {
      setDeliveryAddress('');
      setAddressNote('');
    }
  };

  const handleSaveQuickCustomer = async () => {
    if (!newCustName.trim()) { addToast('Enter customer name', 'error'); return; }
    const newId = 'c-' + Math.random().toString(36).substring(2, 9);
    const code = `CUST-${String((customers?.length || 0) + 1).padStart(3, '0')}`;
    await db.customers.add({
      id: newId, code,
      name: newCustName.trim(),
      phone: newCustPhone.trim(),
      address: newCustAddress.trim(),
      isActive: true,
      createdAt: new Date().toISOString(),
    });
    setSelectedCustomerId(newId);
    if (newCustAddress) setDeliveryAddress(newCustAddress);
    setShowAddCustomer(false);
    setNewCustName(''); setNewCustPhone(''); setNewCustAddress('');
    addToast('Customer added!', 'success');
  };

  // --- Save Order ---
  const handleSaveOrder = async () => {
    if (cart.length === 0) { addToast('Add at least one item to the cart', 'error'); return; }
    if (deliveryType === 'DELIVERY' && !deliveryAddress.trim()) { addToast('Enter a delivery address', 'error'); return; }
    if (deliveryType === 'DELIVERY' && deliveryTime === 'SCHEDULED' && !scheduledAt) { addToast('Choose a delivery date', 'error'); return; }
    if (additionalFeeMode === 'PERCENT' && additionalFeeValue > 100) {
      addToast('Pasabuy fee percentage must be between 0 and 100', 'error'); return;
    }

    setIsSaving(true);
    try {
      const cust = customers?.find(c => c.id === selectedCustomerId);
      const orderId = 'ord-' + Math.random().toString(36).substring(2, 9);
      const now = new Date();
      let orderNo = '';

      const orderRecord: Order = {
        id: orderId, orderNo,
        customerId: selectedCustomerId || 'walk-in',
        customerName: cust?.name || 'Walk-in Customer',
        customerPhone: cust?.phone || '',
        status: 'READY_TO_BUY',
        deliveryType,
        address: deliveryType === 'DELIVERY' ? deliveryAddress : 'Store Pickup',
        addressNote: deliveryType === 'DELIVERY' ? addressNote : undefined,
        notes: orderNotes,
        paymentMethod,
        changeFor: paymentMethod === 'COD' ? changeFor || undefined : undefined,
        deliveryTime: deliveryType === 'DELIVERY' ? (deliveryTime === 'ASAP' ? 'ASAP' : scheduledAt) : undefined,
        discountReason: discount > 0 ? discountReason.trim() || undefined : undefined,
        riderFeeIsCustomerCharge: true,
        serviceFee: summary.fee,
        deliveryFee: deliveryType === 'DELIVERY' ? deliveryFee : 0,
        discount,
        isFeeAdjusted: additionalFeeValue > 0,
        additionalFeeMode,
        additionalFeeValue,
        additionalFeeNote: additionalFeeNote.trim() || undefined,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      const orderItemRecords = cart.map(item => ({
        id: 'item-' + Math.random().toString(36).substring(2, 9),
        orderId,
        productName: item.productName,
        productId: item.productId,
        barcode: products?.find(product => product.id === item.productId)?.barcode,
        storeName: item.storeName,
        qty: item.qty,
        unit: item.unit,
        estimatedPrice: item.estimatedPrice,
        status: 'PENDING' as const,
        feeType: item.feeType,
        manualFeeAmount: item.manualFeeAmount,
        notes: item.notes,
      }));

      await db.transaction('rw', db.orders, db.orderItems, db.settings, async () => {
        orderNo = await nextDailyOrderNumber(now);
        orderRecord.orderNo = orderNo;
        await db.orders.add(orderRecord);
        await db.orderItems.bulkAdd(orderItemRecords);
      });

      try {
        await logUserAction('CREATE_ORDER', `Created order #${orderNo} for ${orderRecord.customerName || 'Customer'} (${orderItemRecords.length} items)`);
      } catch (e) {
        console.warn('Audit log failed:', e);
      }

      addToast(`Order ${orderNo} created!`, 'success');
      openReceiptModal({ order: { ...orderRecord, items: orderItemRecords } });
      setActiveView('orders');
    } catch (error) {
      console.error('Failed to save order:', error);
      addToast('Could not save the order. Please try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // ======================== RENDER ========================
  return (
    <div className="flex flex-col h-full">

      {/* ── MOBILE: Floating Cart Button ── */}
      <div className="md:hidden fixed bottom-20 right-4 z-40">
        <button
          onClick={() => setShowOrderPanel(true)}
          className="relative flex items-center gap-2 px-4 py-3 bg-[#C90052] text-white rounded-2xl shadow-xl font-bold text-sm active:scale-95 transition-transform"
        >
          <ShoppingBag className="w-5 h-5" />
          <span>Review Order</span>
          {cart.length > 0 && (
            <span className="absolute -top-2 -right-2 w-6 h-6 bg-rose-500 text-white text-xs font-black rounded-full flex items-center justify-center">
              {cart.reduce((s, i) => s + i.qty, 0)}
            </span>
          )}
        </button>
      </div>

      {/* ── MAIN LAYOUT ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ════════════════════════════════════════
            LEFT PANEL — Product Grid
        ════════════════════════════════════════ */}
        <div className="new-order-products flex flex-col flex-1 overflow-hidden bg-[#fff7fb]">

          {/* Search + Category Bar */}
          <div className="new-order-toolbar space-y-1 border-b border-pink-100 px-2.5 pb-1.5 pt-1.5 sm:px-3 sm:pt-2">
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#a56d99] sm:h-4 sm:w-4" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search name, store, SKU, or barcode..."
                  className="h-8 w-full rounded-full border border-pink-200 bg-white/90 pl-9 pr-3 text-[11px] shadow-sm placeholder:text-[#907d9b] focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-200 sm:h-9 sm:pl-10 sm:text-xs"
                />
              </div>
              <button
                onClick={() => setShowCustomInput(true)}
                className="flex min-h-8 items-center gap-1 rounded-full bg-gradient-to-r from-[#ec0871] to-[#c90052] px-2.5 text-[11px] font-bold text-white shadow-md transition-transform active:scale-95 sm:min-h-9 sm:px-3 sm:text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                Custom
              </button>
            </div>

            {/* Category Pills */}
            <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-hide sm:gap-1.5">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-all sm:px-3.5 sm:py-1.5 sm:text-[11px] ${selectedCategory === cat
                    ? 'border-[#df0063] bg-gradient-to-r from-[#ec0871] to-[#c90052] text-white shadow-md'
                    : 'border-pink-100 bg-white/70 text-slate-800 shadow-sm hover:bg-pink-50'
                    }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Product Tap Grid */}
          <div className="new-order-product-scroll flex-1 overflow-y-auto p-2 sm:p-2.5">
            {filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-sm space-y-2">
                <Tag className="w-10 h-10 opacity-30" />
                <p>No products found</p>
                <p className="text-xs">Add products in Products & Stores</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 sm:gap-2 lg:grid-cols-4 xl:grid-cols-5">
                {filteredProducts.map(product => {
                  const inCart = cart.find(c => c.productId === product.id);
                  return (
                    <button
                      key={product.id}
                      onClick={() => addToCart({ id: product.id, name: product.name, store: product.store, price: product.price, unit: product.unit, feeType: product.feeType, maxStock: product.isStockItem ? Math.max(0, product.stockQuantity || 0) : undefined, imageUrl: product.imageUrl })}
                      disabled={product.isStockItem && (product.stockQuantity || 0) <= 0}
                      className={`new-order-product-card group relative flex min-h-[146px] select-none flex-col items-center justify-start gap-1 rounded-[16px] border bg-white px-1.5 py-2 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-[164px] sm:gap-1.5 sm:px-2.5 sm:py-2.5 ${inCart
                        ? 'border-[#e81774] bg-[#fff8fc] ring-1 ring-pink-200'
                        : 'border-pink-300 hover:border-pink-400'
                        }`}
                    >
                      {/* Category color dot */}
                      <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-pink-100 to-rose-100 text-sm font-extrabold text-[#c90052] shadow-sm sm:h-14 sm:w-14 sm:text-base">
                        {product.name.charAt(0).toUpperCase()}
                        {product.imageUrl && <img src={product.imageUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full bg-white object-contain p-0.5" onError={event => { event.currentTarget.style.display = 'none'; }} />}
                      </span>

                      <span className="line-clamp-2 min-h-7 text-[11px] font-bold leading-tight text-slate-900 sm:text-xs">
                        {product.name}
                      </span>

                      <span className="text-sm font-extrabold leading-tight text-[#d50a64] sm:text-base">
                        ₱{product.price.toFixed(2)}
                      </span>
                      {product.barcode && <span className="line-clamp-2 break-all text-[8px] leading-3 text-slate-600 sm:text-[9px]">▥ SKU / barcode:<br />{product.barcode}</span>}
                      {product.isStockItem && <span className="mt-auto inline-flex items-center gap-1 rounded-full bg-pink-100 px-2 py-0.5 text-[9px] font-semibold text-[#7b1648]">{(product.stockQuantity || 0) <= 0 ? 'Out of stock' : `▱ Stock: ${product.stockQuantity}`}</span>}

                      {/* Cart badge */}
                      {inCart && (
                        <span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-xs font-black text-slate-900 shadow">
                          {inCart.qty}
                        </span>
                      )}

                      {/* Low stock indicator */}
                      {product.isStockItem && (product.stockQuantity || 0) <= (product.minStockLevel || 5) && (
                        <span className="absolute right-2 top-2 rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold text-amber-950 shadow-sm">
                          Low
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ════════════════════════════════════════
            RIGHT PANEL — Order Cart (Desktop)
        ════════════════════════════════════════ */}
        <div className="hidden md:flex flex-col w-80 lg:w-96 bg-white border-l border-slate-200 overflow-hidden">
          <OrderPanel
            cart={cart}
            customers={customers}
            stores={stores}
            rateTiers={rateTiers}
            selectedCustomerId={selectedCustomerId}
            deliveryType={deliveryType}
            deliveryAddress={deliveryAddress}
            addressNote={addressNote}
            deliveryTime={deliveryTime}
            scheduledAt={scheduledAt}
            paymentMethod={paymentMethod}
            changeFor={changeFor}
            orderNotes={orderNotes}
            deliveryFee={deliveryFee}
            additionalFeeValue={additionalFeeValue}
            additionalFeeMode={additionalFeeMode}
            additionalFeeNote={additionalFeeNote}
            discount={discount}
            discountValue={discountValue}
            discountMode={discountMode}
            discountReason={discountReason}
            isSaving={isSaving}
            summary={summary}
            onCustomerChange={handleCustomerChange}
            onAddCustomer={() => setShowAddCustomer(true)}
            onDeliveryTypeChange={setDeliveryType}
            onDeliveryAddressChange={setDeliveryAddress}
            onAddressNoteChange={setAddressNote}
            onDeliveryTimeChange={setDeliveryTime}
            onScheduledAtChange={setScheduledAt}
            onPaymentMethodChange={setPaymentMethod}
            onChangeForChange={setChangeFor}
            onNotesChange={setOrderNotes}
            onDeliveryFeeChange={setDeliveryFee}
            onAdditionalFeeValueChange={setAdditionalFeeValue}
            onAdditionalFeeModeChange={setAdditionalFeeMode}
            onAdditionalFeeNoteChange={setAdditionalFeeNote}
            onDiscountValueChange={setDiscountValue}
            onDiscountModeChange={setDiscountMode}
            onDiscountReasonChange={setDiscountReason}
            onUpdateQty={updateQty}
            onSetItemQty={setItemQty}
            onRemove={removeFromCart}
            onUpdateItemNotes={updateItemNotes}
            onRestoreItem={restoreItem}
            onClear={clearCart}
            onSave={handleSaveOrder}
          />
        </div>
      </div>

      {/* ── MOBILE: Slide-up Order Panel ── */}
      {showOrderPanel && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col bg-black/50" onClick={() => setShowOrderPanel(false)}>
          <div className="flex-1" />
          <div
            className="min-h-0 overflow-hidden bg-white rounded-t-3xl shadow-2xl flex flex-col"
            style={{ height: '90dvh', maxHeight: '90vh' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between px-5 py-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">Current Order</h3>
              <button onClick={() => setShowOrderPanel(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <OrderPanel
                cart={cart}
                customers={customers}
                stores={stores}
                rateTiers={rateTiers}
                selectedCustomerId={selectedCustomerId}
                deliveryType={deliveryType}
                deliveryAddress={deliveryAddress}
                addressNote={addressNote}
                deliveryTime={deliveryTime}
                scheduledAt={scheduledAt}
                paymentMethod={paymentMethod}
                changeFor={changeFor}
                orderNotes={orderNotes}
                deliveryFee={deliveryFee}
                additionalFeeValue={additionalFeeValue}
                additionalFeeMode={additionalFeeMode}
                additionalFeeNote={additionalFeeNote}
                discount={discount}
                discountValue={discountValue}
                discountMode={discountMode}
                discountReason={discountReason}
                isSaving={isSaving}
                summary={summary}
                onCustomerChange={handleCustomerChange}
                onAddCustomer={() => { setShowOrderPanel(false); setShowAddCustomer(true); }}
                onDeliveryTypeChange={setDeliveryType}
                onDeliveryAddressChange={setDeliveryAddress}
                onAddressNoteChange={setAddressNote}
                onDeliveryTimeChange={setDeliveryTime}
                onScheduledAtChange={setScheduledAt}
                onPaymentMethodChange={setPaymentMethod}
                onChangeForChange={setChangeFor}
                onNotesChange={setOrderNotes}
                onDeliveryFeeChange={setDeliveryFee}
                onAdditionalFeeValueChange={setAdditionalFeeValue}
                onAdditionalFeeModeChange={setAdditionalFeeMode}
                onAdditionalFeeNoteChange={setAdditionalFeeNote}
                onDiscountValueChange={setDiscountValue}
                onDiscountModeChange={setDiscountMode}
                onDiscountReasonChange={setDiscountReason}
                onUpdateQty={updateQty}
                onSetItemQty={setItemQty}
                onRemove={removeFromCart}
                onUpdateItemNotes={updateItemNotes}
                onRestoreItem={restoreItem}
                onClear={clearCart}
                onSave={() => { setShowOrderPanel(false); handleSaveOrder(); }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Custom Item Modal ── */}
      {showCustomInput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Add Custom Item</h3>
              <button onClick={() => setShowCustomInput(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Item Name *</label>
                <input
                  autoFocus
                  type="text"
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddCustomItem()}
                  placeholder="e.g. Chickenjoy 6pc"
                  className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Price (₱)</label>
                  <input
                    type="number"
                    min="0"
                    value={customPrice}
                    onChange={e => setCustomPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Store</label>
                  <select
                    value={customStore}
                    onChange={e => setCustomStore(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
                  >
                    {(stores || []).map(s => (
                      <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setShowCustomInput(false)}
                className="flex-1 py-2.5 text-sm font-semibold text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCustomItem}
                className="flex-1 py-2.5 text-sm font-bold text-white bg-[#C90052] rounded-xl hover:bg-[#E60063] active:scale-95 transition-transform"
              >
                Add to Cart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Quick Add Customer Modal ── */}
      {showAddCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Add New Customer</h3>
              <button onClick={() => setShowAddCustomer(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Full Name *', value: newCustName, setter: setNewCustName, placeholder: 'e.g. Maria Santos' },
                { label: 'Mobile Phone', value: newCustPhone, setter: setNewCustPhone, placeholder: '0917-123-4567' },
                { label: 'Delivery Address', value: newCustAddress, setter: setNewCustAddress, placeholder: 'Brgy. Funda-Dalipe, San Jose' },
              ].map(({ label, value, setter, placeholder }) => (
                <div key={label}>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
                  <input
                    type="text"
                    value={value}
                    onChange={e => setter(e.target.value)}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-pink-600"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowAddCustomer(false)} className="flex-1 py-2.5 text-sm font-semibold text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200">
                Cancel
              </button>
              <button onClick={handleSaveQuickCustomer} className="flex-1 py-2.5 text-sm font-bold text-white bg-[#C90052] rounded-xl hover:bg-[#E60063] active:scale-95">
                Save Customer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ════════════════════════════════════════════════════
// ORDER PANEL (reused for desktop sidebar + mobile sheet)
// ════════════════════════════════════════════════════
interface OrderPanelProps {
  cart: CartItem[];
  customers: any[] | undefined;
  stores: any[] | undefined;
  rateTiers: any[] | undefined;
  selectedCustomerId: string;
  deliveryType: DeliveryType;
  deliveryAddress: string;
  addressNote: string;
  deliveryTime: string;
  scheduledAt: string;
  paymentMethod: PaymentMethod;
  changeFor: number;
  orderNotes: string;
  deliveryFee: number;
  additionalFeeValue: number;
  additionalFeeMode: 'FIXED' | 'PERCENT';
  additionalFeeNote: string;
  discount: number;
  discountValue: number;
  discountMode: 'amount' | 'percent';
  discountReason: string;
  isSaving: boolean;
  summary: any;
  onCustomerChange: (id: string) => void;
  onAddCustomer: () => void;
  onDeliveryTypeChange: (t: DeliveryType) => void;
  onDeliveryAddressChange: (v: string) => void;
  onAddressNoteChange: (v: string) => void;
  onDeliveryTimeChange: (v: string) => void;
  onScheduledAtChange: (v: string) => void;
  onPaymentMethodChange: (v: PaymentMethod) => void;
  onChangeForChange: (v: number) => void;
  onNotesChange: (v: string) => void;
  onDeliveryFeeChange: (v: number) => void;
  onAdditionalFeeValueChange: (v: number) => void;
  onAdditionalFeeModeChange: (v: 'FIXED' | 'PERCENT') => void;
  onAdditionalFeeNoteChange: (v: string) => void;
  onDiscountValueChange: (v: number) => void;
  onDiscountModeChange: (v: 'amount' | 'percent') => void;
  onDiscountReasonChange: (v: string) => void;
  onUpdateQty: (id: string, delta: number) => void;
  onSetItemQty: (id: string, quantity: number) => void;
  onRemove: (id: string) => void;
  onUpdateItemNotes: (id: string, notes: string) => void;
  onRestoreItem: (item: CartItem) => void;
  onClear: () => void;
  onSave: () => void;
}

const OrderPanel: React.FC<OrderPanelProps> = ({
  cart, customers, stores, rateTiers,
  selectedCustomerId, deliveryType, deliveryAddress, addressNote, deliveryTime, scheduledAt, paymentMethod, changeFor, orderNotes,
  deliveryFee, additionalFeeValue, additionalFeeMode, additionalFeeNote, discount, discountValue, discountMode, discountReason, isSaving,
  summary,
  onCustomerChange, onAddCustomer, onDeliveryTypeChange, onDeliveryAddressChange, onAddressNoteChange,
  onDeliveryTimeChange, onScheduledAtChange, onPaymentMethodChange, onChangeForChange,
  onNotesChange, onDeliveryFeeChange, onAdditionalFeeValueChange, onAdditionalFeeModeChange, onAdditionalFeeNoteChange, onDiscountValueChange, onDiscountModeChange, onDiscountReasonChange,
  onUpdateQty, onSetItemQty, onRemove, onUpdateItemNotes, onRestoreItem, onClear, onSave,
}) => {
  // --- Searchable customer combobox state ---
  const [custSearch, setCustSearch] = useState('');
  const [custOpen, setCustOpen] = useState(false);
  const [undoItem, setUndoItem] = useState<CartItem | null>(null);
  const custRef = useRef<HTMLDivElement>(null);
  const cartListRef = useRef<HTMLDivElement>(null);

  const selectedCustomer = (customers || []).find(c => c.id === selectedCustomerId);
  const itemSubtotal = cart.reduce((sum, item) => sum + roundMoney(item.qty * item.estimatedPrice), 0);

  const filteredCustomers = useMemo(() => {
    const q = custSearch.toLowerCase();
    return (customers || []).filter(c =>
      !q || c.name.toLowerCase().includes(q) || (c.phone || '').includes(q)
    );
  }, [customers, custSearch]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (custRef.current && !custRef.current.contains(e.target as Node)) {
        setCustOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    const list = cartListRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  }, [cart.length]);

  const handleSelectCustomer = (id: string) => {
    onCustomerChange(id);
    setCustOpen(false);
    setCustSearch('');
  };

  const removeWithUndo = (item: CartItem) => {
    setUndoItem(item);
    onRemove(item.id);
    window.setTimeout(() => setUndoItem(current => current?.id === item.id ? null : current), 5000);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">

        {/* Customer + Delivery */}
        <div className="shrink-0 px-4 py-3 space-y-3 border-b border-slate-100">
          {/* Searchable Customer Selector */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1" ref={custRef}>
              {/* Trigger button */}
              <button
                type="button"
                onClick={() => { setCustOpen(o => !o); setTimeout(() => (document.getElementById('cust-search-input') as HTMLInputElement)?.focus(), 50); }}
                className="w-full flex items-center justify-between px-3 py-2.5 text-xs bg-white border border-slate-200 rounded-xl shadow-sm hover:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-600 text-left transition-colors"
              >
                <span className={selectedCustomer ? 'text-slate-900 font-semibold' : 'text-slate-400'}>
                  {selectedCustomer ? selectedCustomer.name : 'Walk-in customer (details optional)'}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform shrink-0 ml-1 ${custOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown */}
              {custOpen && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                  {/* Search input inside dropdown */}
                  <div className="p-2 border-b border-slate-100">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input
                        id="cust-search-input"
                        type="text"
                        value={custSearch}
                        onChange={e => setCustSearch(e.target.value)}
                        placeholder="Search name or phone..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
                      />
                    </div>
                  </div>
                  {/* Customer list */}
                  <div className="max-h-44 overflow-y-auto">
                    <button type="button" onClick={() => handleSelectCustomer('')} className={`w-full border-b border-slate-100 px-3 py-2 text-left text-xs hover:bg-pink-50 ${!selectedCustomerId ? 'bg-pink-100 font-bold text-pink-800' : 'text-slate-700'}`}>
                      Walk-in customer <span className="text-slate-500">· no customer details required</span>
                    </button>
                    {filteredCustomers.length === 0 ? (
                      <div className="py-4 text-center text-xs text-slate-400">No customers found</div>
                    ) : (
                      filteredCustomers.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleSelectCustomer(c.id)}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-pink-50 transition-colors ${c.id === selectedCustomerId ? 'bg-pink-100 text-pink-800 font-bold' : 'text-slate-800'}`}
                        >
                          <div className="font-semibold">{c.name}</div>
                          {c.phone && <div className="text-slate-400 text-[10px]">{c.phone}</div>}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={onAddCustomer}
              className="p-2 bg-pink-50 text-pink-700 rounded-xl hover:bg-pink-100 transition-colors shrink-0"
              title="New Customer"
            >
              <UserPlus className="w-4 h-4" />
            </button>
          </div>

          {selectedCustomer ? (
            <div className="relative overflow-hidden rounded-2xl border border-pink-200 bg-gradient-to-br from-pink-50 via-white to-indigo-50 p-3 shadow-sm">
              <div className="absolute -right-5 -top-7 h-20 w-20 rounded-full bg-pink-100/70" />
              <div className="relative flex items-start gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#C90052] to-[#E60063] text-white shadow-sm">
                  <UserRound className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-xs font-bold text-slate-900">{selectedCustomer.name}</p>
                    <Sparkles className="h-3 w-3 shrink-0 text-amber-500" />
                  </div>
                  <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-pink-700">Customer details</p>
                </div>
              </div>
              <div className="relative mt-3 grid gap-2 border-t border-pink-100 pt-2.5">
                {selectedCustomer.phone && <div className="flex items-center gap-2 text-[11px] text-slate-600"><Phone className="h-3.5 w-3.5 shrink-0 text-pink-500" /><span>{selectedCustomer.phone}</span></div>}
                {selectedCustomer.address && <div className="flex items-start gap-2 text-[11px] text-slate-600"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pink-500" /><span className="leading-relaxed">{selectedCustomer.address}</span></div>}
                {selectedCustomer.notes && <div className="flex items-start gap-2 text-[11px] text-slate-600"><StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pink-500" /><span className="leading-relaxed">{selectedCustomer.notes}</span></div>}
                {!selectedCustomer.phone && !selectedCustomer.address && !selectedCustomer.notes && <p className="text-[10px] text-slate-400">No phone, address, or notes saved yet.</p>}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-dashed border-pink-200 bg-pink-50/70 px-3 py-2 text-[11px] text-pink-700">
              <UserRound className="h-3.5 w-3.5" /> Walk-in order · selecting a customer is optional
            </div>
          )}

          {/* Delivery Toggle */}
          <div className="flex bg-slate-100 p-0.5 rounded-xl text-xs border border-slate-200">
            <button
              onClick={() => onDeliveryTypeChange('DELIVERY')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-[10px] transition-all font-semibold ${deliveryType === 'DELIVERY' ? 'bg-white text-pink-800 shadow-sm' : 'text-slate-500'
                }`}
            >
              <Truck className="w-3.5 h-3.5" />Delivery
            </button>
            <button
              onClick={() => onDeliveryTypeChange('PICKUP')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-[10px] transition-all font-semibold ${deliveryType === 'PICKUP' ? 'bg-white text-pink-800 shadow-sm' : 'text-slate-500'
                }`}
            >
              <Building2 className="w-3.5 h-3.5" />Pickup
            </button>
          </div>

          {deliveryType === 'DELIVERY' && (
            <div className="space-y-2">
              <input type="text" value={deliveryAddress} onChange={e => onDeliveryAddressChange(e.target.value)} placeholder="Delivery address / barangay" className="w-full px-3 py-2 text-xs text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-pink-600" />
              <input type="text" value={addressNote} onChange={e => onAddressNoteChange(e.target.value)} placeholder="Landmark or contact instruction (e.g. near chapel)" className="w-full px-3 py-2 text-xs text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-pink-600" />
              <div className="flex gap-2">
                <select value={deliveryTime} onChange={e => onDeliveryTimeChange(e.target.value)} className="flex-1 px-2 py-2 text-xs text-slate-700 bg-white border border-slate-200 rounded-xl">
                  <option value="ASAP">Deliver ASAP</option><option value="SCHEDULED">Schedule delivery</option>
                </select>
                {deliveryTime === 'SCHEDULED' && <input aria-label="Scheduled delivery date" type="date" min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)} value={scheduledAt} onChange={e => onScheduledAtChange(e.target.value)} className="min-w-0 flex-1 px-2 py-2 text-xs text-slate-700 bg-white border border-slate-200 rounded-xl" />}
              </div>
            </div>
          )}
        </div>

        {/* Cart Items */}
        <div ref={cartListRef} className="min-h-[96px] max-h-[28vh] shrink-0 overflow-y-auto overscroll-contain scroll-smooth">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-slate-300 space-y-2">
              <ShoppingBag className="w-10 h-10" />
              <p className="text-xs font-medium">Tap items to add</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {cart.map(item => (
                <div key={item.id} className="flex items-center gap-2 px-4 py-2.5">
                  <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-pink-50 text-sm font-bold text-pink-700">
                    {item.productName.charAt(0).toUpperCase()}
                    {item.imageUrl && <img src={item.imageUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full bg-white object-contain" onError={event => { event.currentTarget.style.display = 'none'; }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold leading-snug text-slate-800 line-clamp-2">{item.productName}</p>
                    <p className="mt-0.5 text-[10px] text-slate-600">₱{item.estimatedPrice.toFixed(2)} / {item.unit} · {item.storeName}</p>
                    <p className="mt-0.5 text-[10px] font-semibold text-slate-700">Line estimate: ₱{roundMoney(item.qty * item.estimatedPrice).toFixed(2)}</p>
                    <input value={item.notes || ''} onChange={e => onUpdateItemNotes(item.id, e.target.value)} placeholder="Item note (e.g. no onions)" className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1 text-[10px] text-slate-700 placeholder:text-slate-500" />
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => onUpdateQty(item.id, -1)}
                      className="w-6 h-6 flex items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-90 transition-transform"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <input aria-label={`Quantity for ${item.productName}`} type="number" min="0.5" max={item.maxStock} step="0.5" inputMode="decimal" value={item.qty} onChange={e => onSetItemQty(item.id, Number(e.target.value))} className="w-12 rounded-md border border-slate-200 py-1 text-center text-xs font-bold text-slate-900" />
                    <button
                      onClick={() => onUpdateQty(item.id, 1)}
                      className="w-6 h-6 flex items-center justify-center rounded-lg bg-pink-100 text-pink-700 hover:bg-pink-200 active:scale-90 transition-transform"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <button aria-label={`Remove ${item.productName}`} onClick={() => removeWithUndo(item)} className="h-9 w-9 flex items-center justify-center rounded-xl text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-colors shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {undoItem && <div className="flex items-center justify-between border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-slate-700"><span>Removed {undoItem.productName}</span><button onClick={() => { onRestoreItem(undoItem); setUndoItem(null); }} className="rounded-lg px-3 py-1.5 font-bold text-pink-800 hover:bg-pink-100">Undo</button></div>}

        <div className="shrink-0 border-t border-slate-100 px-4 py-2.5 space-y-2 bg-white">
          <label className="text-[11px] font-semibold text-slate-700">Payment method</label>
          <select value={paymentMethod} onChange={e => onPaymentMethodChange(e.target.value as PaymentMethod)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800">
            <option value="COD">Cash on delivery (COD)</option><option value="Cash">Cash</option><option value="GCash">GCash</option><option value="Maya">Maya</option><option value="BankTransfer">Bank transfer</option><option value="Other">Other</option>
          </select>
          {paymentMethod === 'COD' && <div className="flex items-center gap-2 text-xs text-slate-700"><span className="shrink-0">Change for ₱</span><input type="number" inputMode="numeric" min="0" value={changeFor || ''} onChange={e => onChangeForChange(Number(e.target.value) || 0)} placeholder="No change needed" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-2 py-2 text-right text-xs" /></div>}
        </div>

      </div>

      {/* Order Summary & Totals */}
      <div className="shrink-0 border-t border-slate-200 px-4 pt-3 pb-4 space-y-2.5 bg-white shadow-[0_-6px_18px_rgba(15,23,42,0.06)]">

        {/* Fee row */}
        <div className="flex justify-between text-xs text-slate-500">
          <span>Subtotal</span>
          <span className="font-semibold text-slate-700">₱{summary.subtotal.toFixed(2)}</span>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
          <label className="block text-[10px] font-semibold text-slate-700">Pasabuy Fee
            <select value={additionalFeeMode} onChange={e => onAdditionalFeeModeChange(e.target.value as 'FIXED' | 'PERCENT')} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800">
              <option value="FIXED">Fixed amount (₱)</option><option value="PERCENT">Percentage of subtotal (%)</option>
            </select>
          </label>
          <div className="w-28">
            <label htmlFor="additional-fee-value" className="block text-[10px] font-semibold text-slate-700">{additionalFeeMode === 'PERCENT' ? 'Percent' : 'Amount'}</label>
            <input id="additional-fee-value" type="number" inputMode="decimal" min="0" max={additionalFeeMode === 'PERCENT' ? 100 : undefined} step="0.01" value={additionalFeeValue} onChange={e => onAdditionalFeeValueChange(Math.max(0, Number(e.target.value) || 0))} className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-right text-xs font-bold text-slate-800" />
          </div>
          <p className="col-span-2 text-[9px] text-slate-500">Optional and applied only to this order. Current Pasabuy fee: ₱{summary.fee.toFixed(2)}.</p>
          {additionalFeeValue > 0 && <input type="text" value={additionalFeeNote} onChange={e => onAdditionalFeeNoteChange(e.target.value)} placeholder="Pasabuy fee note (optional)" className="col-span-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700" />}
        </div>

        {deliveryType === 'DELIVERY' && (
          <div className="flex justify-between items-center text-xs text-slate-500">
            <label htmlFor="order-delivery-fee">Delivery Fee <span className="text-[10px] text-slate-500">(customer charge)</span></label>
            <div className="flex items-center gap-1">
              <span>₱</span>
              <input id="order-delivery-fee" type="number" inputMode="decimal" min="0" step="0.01" value={deliveryFee} onChange={e => onDeliveryFeeChange(Math.max(0, Number(e.target.value) || 0))} className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-right text-xs font-semibold text-slate-700" />
            </div>
          </div>
        )}

        <div className="flex justify-between items-center text-xs text-slate-500">
          <span>Discount</span>
          <div className="flex items-center gap-1">
            <select value={discountMode} onChange={e => onDiscountModeChange(e.target.value as 'amount' | 'percent')} className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px]"><option value="amount">₱</option><option value="percent">%</option></select>
            <input type="number" inputMode="numeric" min="0" max={discountMode === 'percent' ? 100 : itemSubtotal} value={discountValue || ''} onChange={e => onDiscountValueChange(Math.min(Number(e.target.value) || 0, discountMode === 'percent' ? 100 : itemSubtotal))} className="w-16 px-1.5 py-0.5 text-xs text-right font-bold bg-white border border-slate-200 rounded-lg text-emerald-700" />
          </div>
        </div>
        {discount > 0 && <input type="text" value={discountReason} onChange={e => onDiscountReasonChange(e.target.value)} placeholder="Discount reason or promo code" className="w-full px-2.5 py-1.5 text-xs text-slate-700 bg-white border border-slate-200 rounded-xl placeholder:text-slate-500" />}

        {/* Notes */}
        <input
          type="text"
          value={orderNotes}
          onChange={e => onNotesChange(e.target.value)}
          placeholder="Order notes (optional)"
          className="w-full px-2.5 py-1.5 text-xs text-slate-800 bg-white border border-slate-200 rounded-xl placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-pink-500"
        />

        {/* Grand Total */}
        <div className="flex justify-between items-center pt-2 border-t border-slate-200">
          <span className="text-sm font-bold text-slate-900">ESTIMATED TOTAL</span>
          <span className="text-2xl font-black text-[#C90052]">₱{summary.grandTotal.toFixed(2)}</span>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-1">
          {cart.length > 0 && (
            <button
              disabled={isSaving}
              onClick={() => { if (window.confirm('Clear all items from this order?')) onClear(); }}
              className="px-3 py-2.5 text-xs font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 active:scale-95 transition-transform"
            >
              Clear
            </button>
          )}
          <button
            onClick={onSave}
            disabled={cart.length === 0 || (deliveryType === 'DELIVERY' && (!deliveryAddress.trim() || (deliveryTime === 'SCHEDULED' && !scheduledAt))) || isSaving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-[#C90052] to-[#E60063] rounded-xl shadow-md hover:shadow-lg active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving…' : cart.length === 0 ? 'Select Items to Order' : 'Place Order'}
          </button>
        </div>
        {!isSaving && cart.length > 0 && deliveryType === 'DELIVERY' && (!deliveryAddress.trim() || (deliveryTime === 'SCHEDULED' && !scheduledAt)) && (
          <p className="text-center text-[11px] font-medium text-amber-800">
            {!deliveryAddress.trim() ? 'Enter the delivery address to save this order.' : 'Choose the scheduled delivery date to save this order.'}
          </p>
        )}
      </div>
    </div>
  );
};
