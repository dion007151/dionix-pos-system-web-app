import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import {
  CreditCard,
  ChefHat,
  Search,
  Plus,
  Minus,
  Trash2,
  Printer,
  Sparkles,
  ShoppingBag,
  Grid
} from 'lucide-react';
import {
  RestoMenuItem,
  RestoOrder,
  RestoOrderItem,
  PaymentMethod
} from '../../types';
import { roundMoney } from '../../services/calc';

export const RestoRegisterView: React.FC = () => {
  const { addToast, openReceiptModal } = useApp();

  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [orderType, setOrderType] = useState<'Dine-In' | 'Take-Out'>('Dine-In');

  // Active Cart / Ticket
  const [cart, setCart] = useState<{ item: RestoMenuItem; qty: number; notes?: string }[]>([]);

  // Checkout Modal
  const [showCheckout, setShowCheckout] = useState<boolean>(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [cashTendered, setCashTendered] = useState<string>('');

  const menuItems = useLiveQuery(() => db.restoMenuItems.toArray(), []);
  const tables = useLiveQuery(() => db.restoTables.toArray(), []);

  // Distinct Categories
  const categories = Array.from(
    new Set((menuItems || []).map(m => m.category).filter(Boolean))
  );

  // Filtered Menu
  const filteredMenu = (menuItems || []).filter(item => {
    const matchesCat = selectedCategory === 'ALL' || item.category === selectedCategory;
    const matchesSearch =
      !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  // Cart operations
  const handleAddToCart = (item: RestoMenuItem) => {
    setCart(prev => {
      const existing = prev.find(c => c.item.id === item.id);
      if (existing) {
        return prev.map(c =>
          c.item.id === item.id ? { ...c, qty: c.qty + 1 } : c
        );
      }
      return [...prev, { item, qty: 1 }];
    });
  };

  const handleUpdateQty = (itemId: string, delta: number) => {
    setCart(prev =>
      prev
        .map(c => {
          if (c.item.id === itemId) {
            const newQty = c.qty + delta;
            return newQty > 0 ? { ...c, qty: newQty } : null;
          }
          return c;
        })
        .filter(Boolean) as any
    );
  };

  const handleClearCart = () => {
    setCart([]);
  };

  // Financial calculations
  const subtotal = cart.reduce((sum, c) => sum + c.qty * c.item.price, 0);
  const total = subtotal; // Restaurant mode flat total

  // Place & Send Order to Kitchen
  const handleSendToKitchen = async () => {
    if (cart.length === 0) {
      addToast('Ticket is empty! Add items from menu', 'error');
      return;
    }

    const tableObj = tables?.find(t => t.id === selectedTableId);
    const orderCount = await db.restoOrders.count();
    const orderNo = `RESTO-${new Date().getFullYear()}-${String(orderCount + 1).padStart(4, '0')}`;
    const orderId = 'ro-' + Math.random().toString(36).substring(2, 9);

    const items: RestoOrderItem[] = cart.map(c => ({
      id: 'roi-' + Math.random().toString(36).substring(2, 9),
      orderId,
      menuItemId: c.item.id,
      name: c.item.name,
      price: c.item.price,
      qty: c.qty,
      kitchenStatus: 'Pending',
      createdAt: new Date().toISOString()
    }));

    const newRestoOrder: RestoOrder = {
      id: orderId,
      orderNo,
      tableId: selectedTableId || undefined,
      tableName: tableObj ? tableObj.name : 'Take-Out',
      orderType,
      status: 'Open',
      items,
      subtotal,
      serviceCharge: 0,
      discount: 0,
      total,
      isPaid: false,
      createdAt: new Date().toISOString()
    };

    await db.restoOrders.add(newRestoOrder);

    // Update table status if dine-in
    if (selectedTableId) {
      await db.restoTables.update(selectedTableId, {
        status: 'Occupied',
        currentOrderId: orderId
      });
    }

    addToast(`Order ${orderNo} sent to Kitchen KDS!`, 'success');
    handleClearCart();
  };

  // Instant Checkout & Pay
  const handleOpenCheckout = () => {
    if (cart.length === 0) {
      addToast('Ticket is empty! Add items from menu', 'error');
      return;
    }
    setCashTendered(String(total));
    setShowCheckout(true);
  };

  const handleConfirmPayment = async () => {
    const tableObj = tables?.find(t => t.id === selectedTableId);
    const orderCount = await db.restoOrders.count();
    const orderNo = `RESTO-${new Date().getFullYear()}-${String(orderCount + 1).padStart(4, '0')}`;
    const orderId = 'ro-' + Math.random().toString(36).substring(2, 9);

    const items: RestoOrderItem[] = cart.map(c => ({
      id: 'roi-' + Math.random().toString(36).substring(2, 9),
      orderId,
      menuItemId: c.item.id,
      name: c.item.name,
      price: c.item.price,
      qty: c.qty,
      kitchenStatus: 'Ready',
      createdAt: new Date().toISOString()
    }));

    const completedOrder: RestoOrder = {
      id: orderId,
      orderNo,
      tableId: selectedTableId || undefined,
      tableName: tableObj ? tableObj.name : 'Take-Out',
      orderType,
      status: 'Completed',
      items,
      subtotal,
      serviceCharge: 0,
      discount: 0,
      total,
      paymentMethod,
      isPaid: true,
      paidAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    await db.restoOrders.add(completedOrder);

    if (selectedTableId) {
      await db.restoTables.update(selectedTableId, {
        status: 'Available',
        currentOrderId: undefined
      });
    }

    addToast(`Payment recorded for ${orderNo}`, 'success');
    setShowCheckout(false);
    openReceiptModal({ restoOrder: completedOrder });
    handleClearCart();
  };

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-[#8B5E5E]" />
            <span>Angelito's POS Register</span>
          </h2>
          <p className="text-xs text-slate-500">
            Rapid touch ordering for dine-in tables, grill counter, bar, and takeout.
          </p>
        </div>

        {/* Table & Fulfillment Selector */}
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs">
            <button
              onClick={() => setOrderType('Dine-In')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                orderType === 'Dine-In'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600'
              }`}
            >
              Dine-In
            </button>
            <button
              onClick={() => {
                setOrderType('Take-Out');
                setSelectedTableId('');
              }}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                orderType === 'Take-Out'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600'
              }`}
            >
              Take-Out
            </button>
          </div>

          {orderType === 'Dine-In' && (
            <select
              value={selectedTableId}
              onChange={e => setSelectedTableId(e.target.value)}
              className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-xl focus:outline-none"
            >
              <option value="">-- Choose Table --</option>
              {(tables || []).map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.section}) - {t.status}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Main Register Layout: Left Menu Grid + Right Live Ticket (Split on Tablet) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Category Pills + Menu Items (7 or 8 Cols) */}
        <div className="lg:col-span-8 space-y-4">
          {/* Category Pills & Search */}
          <div className="bg-white p-3 border border-slate-200/80 rounded-2xl shadow-xs space-y-2.5">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search food, sizzlers, pulutan, or drinks..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
              <button
                onClick={() => setSelectedCategory('ALL')}
                className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
                  selectedCategory === 'ALL'
                    ? 'bg-[#291818] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All Menu
              </button>
              {categories.map(c => (
                <button
                  key={c}
                  onClick={() => setSelectedCategory(c)}
                  className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-all ${
                    selectedCategory === c
                      ? 'bg-[#291818] text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Menu Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filteredMenu.map(item => {
              const inCart = cart.find(c => c.item.id === item.id);

              return (
                <button
                  key={item.id}
                  onClick={() => handleAddToCart(item)}
                  className={`relative p-3.5 bg-white border rounded-2xl shadow-xs text-left transition-all active:scale-95 flex flex-col justify-between h-28 group ${
                    inCart
                      ? 'border-[#8B5E5E] ring-2 ring-[#8B5E5E]/20 bg-amber-50/20'
                      : 'border-slate-200 hover:border-slate-400'
                  }`}
                >
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      {item.category}
                    </span>
                    <h3 className="font-bold text-xs text-slate-900 mt-0.5 line-clamp-2 leading-snug">
                      {item.name}
                    </h3>
                  </div>

                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                    <span className="text-sm font-black text-[#291818]">
                      ₱{item.price.toFixed(2)}
                    </span>
                    <span className="p-1 rounded-lg bg-slate-100 text-slate-700 group-hover:bg-[#291818] group-hover:text-white transition-colors">
                      <Plus className="w-3.5 h-3.5" />
                    </span>
                  </div>

                  {inCart && (
                    <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[#8B5E5E] text-white font-black text-xs flex items-center justify-center shadow-md animate-pulse">
                      {inCart.qty}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Live Order Ticket / Cart (4 Cols) */}
        <div className="lg:col-span-4">
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs p-4 flex flex-col h-[calc(100vh-140px)] sticky top-20">
            {/* Ticket Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-sm text-slate-900">Current Table Ticket</h3>
                <span className="text-[11px] font-semibold text-slate-500">
                  {orderType} {selectedTableId ? `· Table ${tables?.find(t => t.id === selectedTableId)?.tableNumber}` : ''}
                </span>
              </div>
              {cart.length > 0 && (
                <button
                  onClick={handleClearCart}
                  className="p-1 text-slate-400 hover:text-rose-600 rounded-md"
                  title="Clear Ticket"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Ticket Line Items */}
            <div className="flex-1 overflow-y-auto py-3 space-y-2.5">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-400">
                  <ShoppingBag className="w-8 h-8 mb-2 opacity-40" />
                  <p className="text-xs font-semibold">No food items selected</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Tap menu items to add to bill</p>
                </div>
              ) : (
                cart.map(c => (
                  <div
                    key={c.item.id}
                    className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/60 flex items-center justify-between gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-slate-900 truncate">{c.item.name}</h4>
                      <span className="text-[11px] text-slate-500">
                        ₱{c.item.price.toFixed(2)} each
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleUpdateQty(c.item.id, -1)}
                        className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-600"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-6 text-center text-xs font-bold text-slate-900">
                        {c.qty}
                      </span>
                      <button
                        onClick={() => handleUpdateQty(c.item.id, 1)}
                        className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-600"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="text-right pl-1 min-w-[50px]">
                      <span className="text-xs font-black text-slate-900">
                        ₱{(c.qty * c.item.price).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Ticket Totals & Actions */}
            <div className="pt-3 border-t border-slate-200 space-y-3">
              <div className="flex justify-between items-baseline">
                <span className="text-xs font-bold text-slate-600">Total Amount:</span>
                <span className="text-xl font-black text-[#291818]">
                  ₱{total.toFixed(2)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleSendToKitchen}
                  disabled={cart.length === 0}
                  className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold text-[#291818] bg-amber-100 hover:bg-amber-200 disabled:opacity-50 rounded-xl transition-all active:scale-95"
                >
                  <ChefHat className="w-4 h-4" />
                  <span>Send to KDS</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenCheckout}
                  disabled={cart.length === 0}
                  className="flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold text-white bg-[#291818] hover:bg-[#4A2C2C] disabled:opacity-50 rounded-xl shadow-md transition-all active:scale-95"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Checkout</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Checkout Modal */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5 border border-slate-200 space-y-4">
            <div>
              <span className="text-[10px] font-bold text-[#8B5E5E] uppercase tracking-wider">
                Restaurant Settle Bill
              </span>
              <h3 className="text-xl font-black text-slate-900 mt-1">
                Total: ₱{total.toFixed(2)}
              </h3>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Payment Method
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Cash', 'GCash', 'Maya'] as PaymentMethod[]).map(method => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                        paymentMethod === method
                          ? 'bg-[#291818] text-white border-[#291818]'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Cash Tendered (₱)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={cashTendered}
                  onChange={e => setCashTendered(e.target.value)}
                  className="w-full px-3 py-2 text-lg font-black text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
                />
                {parseFloat(cashTendered) >= total && (
                  <p className="text-xs font-bold text-emerald-700 mt-1">
                    Change: ₱{(parseFloat(cashTendered) - total).toFixed(2)}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCheckout(false)}
                className="flex-1 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPayment}
                className="flex-1 py-2.5 text-xs font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 shadow-md"
              >
                Complete Sale
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
