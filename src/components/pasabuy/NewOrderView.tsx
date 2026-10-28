import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import {
  Minus, Plus, Trash2, Save, UserPlus, Truck, Building2,
  ShoppingBag, Search, ChevronDown, X, Info, Tag
} from 'lucide-react';
import { OrderItem, DeliveryType, ProductFeeType } from '../../types';
import { calculateOrderSummary, roundMoney } from '../../services/calc';

interface CartItem {
  id: string;
  productId?: string;
  productName: string;
  storeName: string;
  qty: number;
  unit: string;
  estimatedPrice: number;
  feeType: ProductFeeType;
  manualFeeAmount?: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  'Food': 'bg-orange-500',
  'Beverage': 'bg-blue-500',
  'Grocery': 'bg-emerald-600',
  'Personal Care': 'bg-pink-500',
  'Medicine': 'bg-red-500',
  'Baby': 'bg-purple-400',
  'Household': 'bg-amber-600',
  'Electronics': 'bg-cyan-600',
  'Clothing': 'bg-indigo-500',
  'Hardware': 'bg-zinc-600',
};

function getCategoryColor(category: string) {
  return CATEGORY_COLORS[category] || 'bg-slate-500';
}

export const NewOrderView: React.FC = () => {
  const { setActiveView, addToast } = useApp();

  const customers = useLiveQuery(() => db.customers.where('isActive').equals(1).toArray(), []);
  const stores = useLiveQuery(() => db.stores.toArray(), []);
  const products = useLiveQuery(() => db.products.toArray(), []);
  const rateTiers = useLiveQuery(() => db.rateTiers.toArray(), []);

  // --- Cart & Order State ---
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('DELIVERY');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [deliveryFee, setDeliveryFee] = useState(50);
  const [discount, setDiscount] = useState(0);
  const [useManualFee, setUseManualFee] = useState(false);
  const [manualFeeAmount, setManualFeeAmount] = useState(50);
  const [feeOverrideNote, setFeeOverrideNote] = useState('');

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

  // --- Categories ---
  const categories = useMemo(() => {
    const cats = Array.from(new Set((products || []).map(p => p.category).filter(Boolean)));
    return ['All', ...cats];
  }, [products]);

  // --- Filtered Products ---
  const filteredProducts = useMemo(() => {
    return (products || []).filter(p => {
      const matchCat = selectedCategory === 'All' || p.category === selectedCategory;
      const matchSearch = !searchQuery ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.store?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  // --- Cart Operations ---
  const addToCart = (product: { id?: string; name: string; store?: string; price: number; unit?: string; feeType?: ProductFeeType }) => {
    const existingIdx = cart.findIndex(c => c.productId === product.id && product.id);
    if (existingIdx >= 0) {
      setCart(prev => prev.map((item, i) =>
        i === existingIdx ? { ...item, qty: item.qty + 1 } : item
      ));
    } else {
      const newItem: CartItem = {
        id: Math.random().toString(36).substring(2, 9),
        productId: product.id,
        productName: product.name,
        storeName: product.store || (stores && stores[0]?.name) || 'Store',
        qty: 1,
        unit: product.unit || 'pc',
        estimatedPrice: product.price,
        feeType: product.feeType || 'STANDARD',
      };
      setCart(prev => [...prev, newItem]);
    }
  };

  const updateQty = (id: string, delta: number) => {
    setCart(prev => prev
      .map(item => item.id === id ? { ...item, qty: Math.max(0.5, +(item.qty + delta).toFixed(1)) } : item)
    );
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const clearCart = () => setCart([]);

  // --- Custom Item ---
  const handleAddCustomItem = () => {
    if (!customName.trim()) { addToast('Enter item name', 'error'); return; }
    addToCart({
      name: customName.trim(),
      store: customStore || (stores && stores[0]?.name) || 'Store',
      price: parseFloat(customPrice) || 0,
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
  }));

  const summary = calculateOrderSummary(
    {
      items: calculatedItems,
      deliveryFee: deliveryType === 'DELIVERY' ? deliveryFee : 0,
      discount,
      manualFeeOverride: useManualFee ? manualFeeAmount : undefined,
      feeOverrideNote: useManualFee ? feeOverrideNote : undefined,
    },
    rateTiers
  );

  // --- Customer ---
  const handleCustomerChange = (id: string) => {
    setSelectedCustomerId(id);
    const cust = customers?.find(c => c.id === id);
    if (cust && deliveryType === 'DELIVERY' && !deliveryAddress) {
      setDeliveryAddress(cust.address);
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
    if (!selectedCustomerId) { addToast('Please select a customer', 'error'); return; }
    if (cart.length === 0) { addToast('Add at least one item to the cart', 'error'); return; }
    if (useManualFee && !feeOverrideNote.trim()) {
      addToast('Reason required when overriding Pasabuy fee', 'error'); return;
    }

    const cust = customers?.find(c => c.id === selectedCustomerId);
    const orderId = 'ord-' + Math.random().toString(36).substring(2, 9);
    const orderCount = await db.orders.count();
    const orderNo = `ORD-${new Date().getFullYear()}-${String(orderCount + 1).padStart(4, '0')}`;

    await db.orders.add({
      id: orderId, orderNo,
      customerId: selectedCustomerId,
      customerName: cust?.name || 'Walk-in',
      customerPhone: cust?.phone || '',
      status: 'READY_TO_BUY',
      deliveryType,
      address: deliveryType === 'DELIVERY' ? deliveryAddress : 'Store Pickup',
      notes: orderNotes,
      serviceFee: summary.fee,
      deliveryFee: deliveryType === 'DELIVERY' ? deliveryFee : 0,
      discount,
      manualFeeOverride: useManualFee ? manualFeeAmount : undefined,
      feeOverrideNote: useManualFee ? feeOverrideNote : undefined,
      isFeeAdjusted: useManualFee,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await db.orderItems.bulkAdd(cart.map(item => ({
      id: 'item-' + Math.random().toString(36).substring(2, 9),
      orderId,
      productName: item.productName,
      storeName: item.storeName,
      qty: item.qty,
      unit: item.unit,
      estimatedPrice: item.estimatedPrice,
      status: 'PENDING' as const,
      feeType: item.feeType,
      manualFeeAmount: item.manualFeeAmount,
    })));

    addToast(`Order ${orderNo} created!`, 'success');
    setActiveView('buying-list');
  };

  // ======================== RENDER ========================
  return (
    <div className="flex flex-col h-full">

      {/* ── MOBILE: Floating Cart Button ── */}
      <div className="md:hidden fixed bottom-20 right-4 z-40">
        <button
          onClick={() => setShowOrderPanel(true)}
          className="relative flex items-center gap-2 px-4 py-3 bg-[#452B86] text-white rounded-2xl shadow-xl font-bold text-sm active:scale-95 transition-transform"
        >
          <ShoppingBag className="w-5 h-5" />
          <span>Order</span>
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
        <div className="flex flex-col flex-1 overflow-hidden bg-slate-100">

          {/* Search + Category Bar */}
          <div className="px-3 pt-3 pb-2 bg-white border-b border-slate-200 space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search products..."
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-100 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-600 focus:bg-white"
                />
              </div>
              <button
                onClick={() => setShowCustomInput(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#452B86] text-white text-xs font-bold rounded-xl active:scale-95 transition-transform whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Custom
              </button>
            </div>

            {/* Category Pills */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`shrink-0 px-3 py-1 text-xs font-semibold rounded-full transition-all ${
                    selectedCategory === cat
                      ? 'bg-[#452B86] text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Product Tap Grid */}
          <div className="flex-1 overflow-y-auto p-3">
            {filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-sm space-y-2">
                <Tag className="w-10 h-10 opacity-30" />
                <p>No products found</p>
                <p className="text-xs">Add products in Products & Stores</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
                {filteredProducts.map(product => {
                  const inCart = cart.find(c => c.productId === product.id);
                  const colorClass = getCategoryColor(product.category);
                  return (
                    <button
                      key={product.id}
                      onClick={() => addToCart({ id: product.id, name: product.name, store: product.store, price: product.price, unit: product.unit, feeType: product.feeType })}
                      className={`relative flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border-2 text-center transition-all active:scale-95 select-none min-h-[100px] shadow-sm ${
                        inCart
                          ? 'bg-purple-700 border-purple-500 text-white shadow-purple-200 shadow-md'
                          : 'bg-white border-slate-200 hover:border-purple-300 hover:shadow-md text-slate-800'
                      }`}
                    >
                      {/* Category color dot */}
                      <span className={`w-8 h-8 rounded-xl ${inCart ? 'bg-white/20' : colorClass} flex items-center justify-center text-white text-lg font-black shrink-0`}>
                        {product.name.charAt(0).toUpperCase()}
                      </span>

                      <span className={`text-xs font-bold leading-tight line-clamp-2 ${inCart ? 'text-white' : 'text-slate-800'}`}>
                        {product.name}
                      </span>

                      <span className={`text-[11px] font-black ${inCart ? 'text-purple-200' : 'text-[#452B86]'}`}>
                        ₱{product.price.toFixed(2)}
                      </span>

                      {/* Cart badge */}
                      {inCart && (
                        <span className="absolute -top-2 -right-2 w-6 h-6 bg-amber-400 text-slate-900 text-xs font-black rounded-full flex items-center justify-center shadow">
                          {inCart.qty}
                        </span>
                      )}

                      {/* Low stock indicator */}
                      {product.isStockItem && (product.stockQuantity || 0) <= (product.minStockLevel || 5) && (
                        <span className="absolute bottom-1 left-1 text-[9px] font-bold text-amber-500 bg-amber-50 px-1 rounded">
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
            orderNotes={orderNotes}
            deliveryFee={deliveryFee}
            discount={discount}
            useManualFee={useManualFee}
            manualFeeAmount={manualFeeAmount}
            feeOverrideNote={feeOverrideNote}
            summary={summary}
            onCustomerChange={handleCustomerChange}
            onAddCustomer={() => setShowAddCustomer(true)}
            onDeliveryTypeChange={setDeliveryType}
            onDeliveryAddressChange={setDeliveryAddress}
            onNotesChange={setOrderNotes}
            onDeliveryFeeChange={setDeliveryFee}
            onDiscountChange={setDiscount}
            onManualFeeToggle={setUseManualFee}
            onManualFeeAmountChange={setManualFeeAmount}
            onFeeOverrideNoteChange={setFeeOverrideNote}
            onUpdateQty={updateQty}
            onRemove={removeFromCart}
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
            className="bg-white rounded-t-3xl shadow-2xl flex flex-col"
            style={{ maxHeight: '90vh' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">Current Order</h3>
              <button onClick={() => setShowOrderPanel(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <OrderPanel
                cart={cart}
                customers={customers}
                stores={stores}
                rateTiers={rateTiers}
                selectedCustomerId={selectedCustomerId}
                deliveryType={deliveryType}
                deliveryAddress={deliveryAddress}
                orderNotes={orderNotes}
                deliveryFee={deliveryFee}
                discount={discount}
                useManualFee={useManualFee}
                manualFeeAmount={manualFeeAmount}
                feeOverrideNote={feeOverrideNote}
                summary={summary}
                onCustomerChange={handleCustomerChange}
                onAddCustomer={() => { setShowOrderPanel(false); setShowAddCustomer(true); }}
                onDeliveryTypeChange={setDeliveryType}
                onDeliveryAddressChange={setDeliveryAddress}
                onNotesChange={setOrderNotes}
                onDeliveryFeeChange={setDeliveryFee}
                onDiscountChange={setDiscount}
                onManualFeeToggle={setUseManualFee}
                onManualFeeAmountChange={setManualFeeAmount}
                onFeeOverrideNoteChange={setFeeOverrideNote}
                onUpdateQty={updateQty}
                onRemove={removeFromCart}
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
                  className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600"
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
                    className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600"
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
                className="flex-1 py-2.5 text-sm font-bold text-white bg-[#452B86] rounded-xl hover:bg-[#5B43E8] active:scale-95 transition-transform"
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
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowAddCustomer(false)} className="flex-1 py-2.5 text-sm font-semibold text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200">
                Cancel
              </button>
              <button onClick={handleSaveQuickCustomer} className="flex-1 py-2.5 text-sm font-bold text-white bg-[#452B86] rounded-xl hover:bg-[#5B43E8] active:scale-95">
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
  orderNotes: string;
  deliveryFee: number;
  discount: number;
  useManualFee: boolean;
  manualFeeAmount: number;
  feeOverrideNote: string;
  summary: any;
  onCustomerChange: (id: string) => void;
  onAddCustomer: () => void;
  onDeliveryTypeChange: (t: DeliveryType) => void;
  onDeliveryAddressChange: (v: string) => void;
  onNotesChange: (v: string) => void;
  onDeliveryFeeChange: (v: number) => void;
  onDiscountChange: (v: number) => void;
  onManualFeeToggle: (v: boolean) => void;
  onManualFeeAmountChange: (v: number) => void;
  onFeeOverrideNoteChange: (v: string) => void;
  onUpdateQty: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onSave: () => void;
}

const OrderPanel: React.FC<OrderPanelProps> = ({
  cart, customers, stores, rateTiers,
  selectedCustomerId, deliveryType, deliveryAddress, orderNotes,
  deliveryFee, discount, useManualFee, manualFeeAmount, feeOverrideNote,
  summary,
  onCustomerChange, onAddCustomer, onDeliveryTypeChange, onDeliveryAddressChange,
  onNotesChange, onDeliveryFeeChange, onDiscountChange, onManualFeeToggle,
  onManualFeeAmountChange, onFeeOverrideNoteChange,
  onUpdateQty, onRemove, onClear, onSave,
}) => {
  return (
    <div className="flex flex-col h-full">

      {/* Customer + Delivery */}
      <div className="px-4 py-3 space-y-3 border-b border-slate-100">
        {/* Customer Selector */}
        <div className="flex items-center gap-2">
          <select
            value={selectedCustomerId}
            onChange={e => onCustomerChange(e.target.value)}
            className="flex-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-600"
          >
            <option value="">— Select Customer —</option>
            {(customers || []).map(c => (
              <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>
            ))}
          </select>
          <button
            onClick={onAddCustomer}
            className="p-2 bg-purple-50 text-purple-700 rounded-xl hover:bg-purple-100 transition-colors"
            title="New Customer"
          >
            <UserPlus className="w-4 h-4" />
          </button>
        </div>

        {/* Delivery Toggle */}
        <div className="flex bg-slate-100 p-0.5 rounded-xl text-xs border border-slate-200">
          <button
            onClick={() => onDeliveryTypeChange('DELIVERY')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-[10px] transition-all font-semibold ${
              deliveryType === 'DELIVERY' ? 'bg-white text-purple-800 shadow-sm' : 'text-slate-500'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />Delivery
          </button>
          <button
            onClick={() => onDeliveryTypeChange('PICKUP')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-[10px] transition-all font-semibold ${
              deliveryType === 'PICKUP' ? 'bg-white text-purple-800 shadow-sm' : 'text-slate-500'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />Pickup
          </button>
        </div>

        {deliveryType === 'DELIVERY' && (
          <input
            type="text"
            value={deliveryAddress}
            onChange={e => onDeliveryAddressChange(e.target.value)}
            placeholder="Delivery address / landmark"
            className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-purple-600"
          />
        )}
      </div>

      {/* Cart Items */}
      <div className="flex-1 overflow-y-auto">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-slate-300 space-y-2">
            <ShoppingBag className="w-10 h-10" />
            <p className="text-xs font-medium">Tap items to add</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {cart.map(item => (
              <div key={item.id} className="flex items-center gap-2 px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-800 truncate">{item.productName}</p>
                  <p className="text-[10px] text-slate-400">{item.storeName} · ₱{item.estimatedPrice.toFixed(2)}/{item.unit}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => onUpdateQty(item.id, -1)}
                    className="w-6 h-6 flex items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-90 transition-transform"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-8 text-center text-xs font-bold text-slate-900">{item.qty}</span>
                  <button
                    onClick={() => onUpdateQty(item.id, 1)}
                    className="w-6 h-6 flex items-center justify-center rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 active:scale-90 transition-transform"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                <span className="w-14 text-right text-xs font-black text-slate-800 shrink-0">
                  ₱{roundMoney(item.qty * item.estimatedPrice).toFixed(2)}
                </span>
                <button onClick={() => onRemove(item.id)} className="text-slate-300 hover:text-rose-500 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Order Summary & Totals */}
      <div className="border-t border-slate-200 px-4 pt-3 pb-4 space-y-2.5 bg-slate-50/50">

        {/* Fee row */}
        <div className="flex justify-between text-xs text-slate-500">
          <span>Subtotal</span>
          <span className="font-semibold text-slate-700">₱{summary.subtotal.toFixed(2)}</span>
        </div>

        <div className="flex justify-between items-center text-xs text-slate-500">
          <div className="flex items-center gap-1">
            <span>Pasabuy Fee</span>
            <Info className="w-3 h-3 text-slate-300" />
          </div>
          <span className="font-semibold text-purple-700">₱{summary.fee.toFixed(2)}</span>
        </div>

        {/* Manual fee toggle */}
        <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
          <input
            type="checkbox"
            checked={useManualFee}
            onChange={e => onManualFeeToggle(e.target.checked)}
            className="rounded text-purple-600 w-3 h-3"
          />
          Manual Fee Override
        </label>

        {useManualFee && (
          <div className="space-y-1.5 p-2.5 bg-amber-50 border border-amber-200 rounded-xl">
            <input
              type="number" min="0" value={manualFeeAmount}
              onChange={e => onManualFeeAmountChange(parseFloat(e.target.value) || 0)}
              placeholder="Override fee ₱"
              className="w-full px-2 py-1 text-xs font-bold bg-white border border-amber-300 rounded-lg"
            />
            <input
              type="text" value={feeOverrideNote}
              onChange={e => onFeeOverrideNoteChange(e.target.value)}
              placeholder="Reason (required) *"
              className="w-full px-2 py-1 text-xs bg-white border border-amber-300 rounded-lg"
            />
          </div>
        )}

        {deliveryType === 'DELIVERY' && (
          <div className="flex justify-between items-center text-xs text-slate-500">
            <span>Rider Fee</span>
            <div className="flex items-center gap-1">
              <span>₱</span>
              <input
                type="number" min="0" value={deliveryFee}
                onChange={e => onDeliveryFeeChange(parseFloat(e.target.value) || 0)}
                className="w-16 px-1.5 py-0.5 text-xs text-right font-bold bg-white border border-slate-200 rounded-lg"
              />
            </div>
          </div>
        )}

        <div className="flex justify-between items-center text-xs text-slate-500">
          <span>Discount</span>
          <div className="flex items-center gap-1">
            <span>-₱</span>
            <input
              type="number" min="0" value={discount}
              onChange={e => onDiscountChange(parseFloat(e.target.value) || 0)}
              className="w-16 px-1.5 py-0.5 text-xs text-right font-bold bg-white border border-slate-200 rounded-lg text-emerald-600"
            />
          </div>
        </div>

        {/* Notes */}
        <input
          type="text"
          value={orderNotes}
          onChange={e => onNotesChange(e.target.value)}
          placeholder="Order notes (optional)"
          className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-purple-500"
        />

        {/* Grand Total */}
        <div className="flex justify-between items-center pt-2 border-t border-slate-200">
          <span className="text-sm font-bold text-slate-900">TOTAL</span>
          <span className="text-2xl font-black text-[#452B86]">₱{summary.grandTotal.toFixed(2)}</span>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-1">
          {cart.length > 0 && (
            <button
              onClick={onClear}
              className="px-3 py-2.5 text-xs font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 active:scale-95 transition-transform"
            >
              Clear
            </button>
          )}
          <button
            onClick={onSave}
            disabled={cart.length === 0 || !selectedCustomerId}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-[#452B86] to-[#5B43E8] rounded-xl shadow-md hover:shadow-lg active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            <Save className="w-4 h-4" />
            Place Order
          </button>
        </div>
      </div>
    </div>
  );
};
