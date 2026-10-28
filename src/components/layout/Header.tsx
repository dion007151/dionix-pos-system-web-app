import React from 'react';
import { useApp } from '../../context/AppContext';
import {
  Menu,
  Wifi,
  WifiOff,
  ShoppingBag,
  PlusCircle,
  User as UserIcon
} from 'lucide-react';

export const Header: React.FC = () => {
  const {
    isOnline,
    setIsMobileMenuOpen,
    currentUser,
    setActiveView
  } = useApp();

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 shadow-xs md:px-6">
      {/* Left: Hamburger & Antique Pasabuy Brand */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="p-2 -ml-2 text-slate-600 rounded-lg md:hidden hover:bg-slate-100 focus:outline-none"
          aria-label="Open navigation menu"
        >
          <Menu className="w-6 h-6" />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white shadow-sm bg-gradient-to-tr from-[#452B86] to-[#7C3AED]">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-slate-900 md:text-lg">
                Antique Pasabuy POS
              </h1>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                RETAIL & PASABUY
              </span>
            </div>
            <p className="text-xs text-slate-500 hidden sm:block">
              DIONIX POS · Your Orders. Our Hands. Delivered.
            </p>
          </div>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Offline / Online Status Badge */}
        <div
          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
            isOnline
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
              : 'bg-amber-50 text-amber-700 border border-amber-200/60'
          }`}
          title={
            isOnline
              ? 'Connected · Local-First IndexedDB Active'
              : 'Offline Mode · IndexedDB saves all changes locally'
          }
        >
          {isOnline ? (
            <Wifi className="w-3.5 h-3.5 text-emerald-600" />
          ) : (
            <WifiOff className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
          )}
          <span className="hidden md:inline">
            {isOnline ? 'Local-First' : 'Offline'}
          </span>
        </div>

        {/* Quick Action: New Order */}
        <button
          onClick={() => setActiveView('new-order')}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#452B86] hover:bg-[#5B43E8] rounded-xl shadow-xs transition-all active:scale-95"
        >
          <PlusCircle className="w-4 h-4" />
          <span>New Order</span>
        </button>

        {/* User Info */}
        <div className="flex items-center gap-2 pl-1 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 font-bold text-xs border border-slate-200">
            <UserIcon className="w-4 h-4" />
          </div>
          <div className="hidden lg:block text-left text-xs leading-tight">
            <p className="font-semibold text-slate-800">{currentUser?.fullName || 'Administrator'}</p>
            <p className="text-[10px] text-slate-500">{currentUser?.role || 'Admin'}</p>
          </div>
        </div>
      </div>
    </header>
  );
};
