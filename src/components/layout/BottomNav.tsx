import React from 'react';
import { useApp } from '../../context/AppContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import {
  LayoutDashboard,
  PlusCircle,
  ShoppingCart,
  Package,
  Boxes,
  Menu
} from 'lucide-react';

export const BottomNav: React.FC = () => {
  const {
    activeView,
    setActiveView,
    setIsMobileMenuOpen
  } = useApp();

  // Live queries for mobile badges
  const pendingItemsCount = useLiveQuery(
    async () => {
      return await db.orderItems.where('status').equals('PENDING').count();
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

  const tabs = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
    { id: 'new-order', label: 'New Order', icon: PlusCircle },
    {
      id: 'buying-list',
      label: 'Shopping',
      icon: ShoppingCart,
      badge: pendingItemsCount && pendingItemsCount > 0 ? pendingItemsCount : undefined
    },
    {
      id: 'inventory',
      label: 'Stock',
      icon: Boxes,
      badge: lowStockCount && lowStockCount > 0 ? lowStockCount : undefined
    },
    { id: 'orders', label: 'Orders', icon: Package }
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around h-16 bg-white border-t border-slate-200 shadow-lg md:hidden">
      {tabs.map(tab => {
        const Icon = tab.icon;
        const isActive = activeView === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => setActiveView(tab.id as any)}
            className={`relative flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-all ${
              isActive ? 'text-[#452B86] font-bold' : 'text-slate-500 font-normal'
            }`}
          >
            <div className="relative">
              <Icon className="w-5 h-5" />
              {tab.badge !== undefined && (
                <span className="absolute -top-1.5 -right-2 px-1.5 py-0.2 text-[9px] font-extrabold text-white bg-amber-500 rounded-full">
                  {tab.badge}
                </span>
              )}
            </div>
            <span className="text-[10px] mt-1">{tab.label}</span>
          </button>
        );
      })}

      {/* More / Menu Drawer Toggle */}
      <button
        onClick={() => setIsMobileMenuOpen(true)}
        className="flex flex-col items-center justify-center flex-1 h-full py-1 text-slate-500 hover:text-slate-900"
      >
        <Menu className="w-5 h-5" />
        <span className="text-[10px] mt-1">More</span>
      </button>
    </nav>
  );
};
