import React, { useEffect, useState } from 'react';
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
  X,
  Database,
  ChevronDown,
  List,
  CreditCard,
  History,
  Archive as ArchiveIcon,
  ClipboardList,
  LogOut
} from 'lucide-react';

const MASTERLIST_VIEWS: ActiveView[] = [
  'masterlist-all', 'masterlist-orders', 'masterlist-payments', 'masterlist-expenses', 'masterlist-inventory'
];
const MASTERLIST_ITEMS: Array<{ id: ActiveView; label: string; icon: React.ElementType }> = [
  { id: 'masterlist-all', label: 'All Records', icon: List },
  { id: 'masterlist-orders', label: 'Orders Masterlist', icon: Package },
  { id: 'masterlist-payments', label: 'Payments Masterlist', icon: CreditCard },
  { id: 'masterlist-expenses', label: 'Expenses Masterlist', icon: Receipt },
  { id: 'masterlist-inventory', label: 'Inventory History', icon: History }
];

export const Sidebar: React.FC = () => {
  const {
    activeView,
    setActiveView,
    isMobileMenuOpen,
    setIsMobileMenuOpen,
    currentUser,
    logout
  } = useApp();
  const [isMasterlistExpanded, setIsMasterlistExpanded] = useState(() => MASTERLIST_VIEWS.includes(activeView));

  useEffect(() => {
    if (MASTERLIST_VIEWS.includes(activeView)) setIsMasterlistExpanded(true);
  }, [activeView]);

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
        o => !o.isArchived && o.status !== 'COMPLETED' && o.status !== 'CANCELLED'
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
    { id: 'archive' as ActiveView, label: 'Archive', icon: ArchiveIcon },
    { id: 'customers' as ActiveView, label: 'Customers', icon: Users },
    { id: 'expenses' as ActiveView, label: 'Daily Expenses', icon: Receipt },
    { id: 'reports' as ActiveView, label: 'Financial Reports', icon: BarChart3 },
    { id: 'settings' as ActiveView, label: 'Settings & Backup', icon: Settings },
    ...(currentUser?.role === 'Admin' ? [{ id: 'audit-logs' as ActiveView, label: 'Audit Logs', icon: ClipboardList }] : [])
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
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col w-64 transition-transform duration-300 ease-in-out md:static md:translate-x-0 bg-[#371320] text-slate-300 ${isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
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
              <React.Fragment key={item.id}>
                <button
                  onClick={() => handleNavClick(item.id)}
                  className={`flex items-center justify-between w-full px-3 py-2.5 text-xs font-medium rounded-xl transition-all ${isActive
                      ? 'bg-[#C90052] text-white shadow-sm font-semibold'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'
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

                {item.id === 'products' && (() => {
                  const isMasterlistActive = MASTERLIST_VIEWS.includes(activeView);
                  return <div className="space-y-1">
                    <div className={`flex w-full items-center rounded-xl text-xs font-medium transition-all ${isMasterlistActive ? 'bg-[#C90052] text-white shadow-sm font-semibold' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}>
                      <button type="button" onClick={() => { setIsMasterlistExpanded(true); handleNavClick('masterlist-all'); }} aria-current={activeView === 'masterlist-all' ? 'page' : undefined} className="flex min-w-0 flex-1 items-center gap-3 rounded-l-xl px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300">
                        <Database className={`h-4 w-4 shrink-0 ${isMasterlistActive ? 'text-white' : 'text-slate-400'}`} />
                        <span>Masterlist</span>
                      </button>
                      <button type="button" onClick={() => setIsMasterlistExpanded(open => !open)} aria-label={isMasterlistExpanded ? 'Collapse Masterlist submenu' : 'Expand Masterlist submenu'} aria-expanded={isMasterlistExpanded} aria-controls="masterlist-submenu" className="rounded-r-xl px-3 py-2.5 text-slate-400 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300">
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${isMasterlistExpanded ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                    <div id="masterlist-submenu" aria-hidden={!isMasterlistExpanded} className={`grid transition-all duration-300 ease-in-out ${isMasterlistExpanded ? 'grid-rows-[1fr] opacity-100' : 'pointer-events-none grid-rows-[0fr] opacity-0'}`}>
                      <div className="min-h-0 overflow-hidden pl-3">
                        <div className="space-y-0.5 border-l border-white/10 pl-2">
                          {MASTERLIST_ITEMS.map(subitem => {
                            const SubIcon = subitem.icon;
                            const selected = activeView === subitem.id;
                            return <button key={subitem.id} type="button" tabIndex={isMasterlistExpanded ? 0 : -1} aria-current={selected ? 'page' : undefined} onClick={() => handleNavClick(subitem.id)} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 ${selected ? 'bg-white/10 font-semibold text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
                              <SubIcon className={`h-3.5 w-3.5 shrink-0 ${selected ? 'text-pink-300' : 'text-slate-500'}`} />
                              <span>{subitem.label}</span>
                            </button>;
                          })}
                        </div>
                      </div>
                    </div>
                  </div>;
                })()}
              </React.Fragment>
            );
          })}
        </div>

        {/* Logout Button */}
        <div className="px-3 pb-2">
          <button
            onClick={() => logout()}
            className="flex items-center gap-2.5 w-full px-3 py-2.5 text-xs font-medium rounded-xl text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>

          {/* Sidebar Footer */}
          <div className="p-3.5 border-t border-white/10 bg-black/20 text-[11px] text-slate-400">
            <p className="font-medium text-slate-300">Antique Pasabuy POS</p>
            <p className="text-[10px] text-slate-500 mt-0.5">San Jose de Buenavista</p>
          </div>
      </aside>
    </>
  );
};
