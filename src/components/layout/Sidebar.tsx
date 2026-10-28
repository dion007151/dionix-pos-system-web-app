import React from 'react';
import { useApp, ActiveView } from '../../context/AppContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import {
  LayoutDashboard,
  PlusCircle,
  ShoppingCart,
  Package,
  Boxes,
  Tag,
  Users,
  Receipt,
  BarChart3,
  Settings,
  X
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const {
    activeView,
    setActiveView,
    isMobileMenuOpen,
    setIsMobileMenuOpen
  } = useApp();

  // Live badge queries
  const pendingItemsCount = useLiveQuery(
    async () => {
      return await db.orderItems.where('status').equals('PENDING').count();
    },
    []
  );

  const activeOrdersCount = useLiveQuery(
    async () => {
      const orders = await db.orders.toArray();
      return orders.filter(
        o => o.status !== 'COMPLETED' && o.status !== 'CANCELLED'
      ).length;
    },
    []
  );

  const lowStockCount = useLiveQuery(
    async () => {
      const products = await db.products.toArray();
      return products.filter(
        p => p.isStockItem && (p.stockQuantity || 0) <= (p.minStockLevel || 5)
      ).length;
    },
    []
  );

  const navItems = [
    { id: 'dashboard' as ActiveView, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'new-order' as ActiveView, label: 'New Order', icon: PlusCircle },
    {
      id: 'buying-list' as ActiveView,
      label: 'Buying List',
      icon: ShoppingCart,
      badge: pendingItemsCount && pendingItemsCount > 0 ? pendingItemsCount : undefined,
      badgeColor: 'bg-amber-500'
    },
    {
      id: 'orders' as ActiveView,
      label: 'Orders List',
      icon: Package,
      badge: activeOrdersCount && activeOrdersCount > 0 ? activeOrdersCount : undefined,
      badgeColor: 'bg-blue-600'
    },
    {
      id: 'inventory' as ActiveView,
      label: 'Inventory & Stock',
      icon: Boxes,
      badge: lowStockCount && lowStockCount > 0 ? `${lowStockCount} Low` : undefined,
      badgeColor: 'bg-amber-600'
    },
    { id: 'products' as ActiveView, label: 'Products & Stores', icon: Tag },
    { id: 'customers' as ActiveView, label: 'Customers', icon: Users },
    { id: 'expenses' as ActiveView, label: 'Daily Expenses', icon: Receipt },
    { id: 'reports' as ActiveView, label: 'Financial Reports', icon: BarChart3 },
    { id: 'settings' as ActiveView, label: 'Settings & Backup', icon: Settings }
  ];

  const handleNavClick = (view: ActiveView) => {
    setActiveView(view);
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col w-64 transition-transform duration-300 ease-in-out md:static md:translate-x-0 bg-[#10182B] text-slate-300 ${
          isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* Mobile Sidebar Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 md:hidden">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white text-sm">
              Antique Pasabuy POS
            </span>
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="p-1 rounded-lg text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sidebar Nav Items */}
        <div className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <div className="px-3 pb-2 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
            Antique Pasabuy Operations
          </div>

          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeView === item.id;

            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`flex items-center justify-between w-full px-3 py-2.5 text-xs font-medium rounded-xl transition-all ${
                  isActive
                    ? 'bg-[#452B86] text-white shadow-sm font-semibold'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 ${
                      isActive ? 'text-white' : 'text-slate-400'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>

                {item.badge !== undefined && (
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold text-white rounded-full ${item.badgeColor}`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Sidebar Footer Info */}
        <div className="p-4 border-t border-white/10 bg-black/20 text-[11px] text-slate-400">
          <div className="flex items-center justify-between">
            <span>Antique Pasabuy POS</span>
            <span className="text-emerald-400 font-semibold">v2.1</span>
          </div>
          <p className="mt-1 text-[10px] text-slate-500">
            Offline-Ready · 100% Free on Vercel
          </p>
        </div>
      </aside>
    </>
  );
};
