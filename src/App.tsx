import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { BottomNav } from './components/layout/BottomNav';
import { ThermalReceiptModal } from './components/layout/ThermalReceiptModal';
import { LoginPage } from './components/auth/LoginPage';

// Pasabuy Views
import { DashboardView } from './components/pasabuy/DashboardView';
import { NewOrderView } from './components/pasabuy/NewOrderView';
import { BuyingListView } from './components/pasabuy/BuyingListView';
import { OrdersView } from './components/pasabuy/OrdersView';
import { InventoryView } from './components/pasabuy/InventoryView';
import { ProductsView } from './components/pasabuy/ProductsView';
import { MasterlistView } from './components/pasabuy/MasterlistView';
import { ArchiveView } from './components/pasabuy/ArchiveView';
import { CustomersView } from './components/pasabuy/CustomersView';
import { ExpensesView } from './components/pasabuy/ExpensesView';
import { ReportsView } from './components/pasabuy/ReportsView';
import { SettingsView } from './components/pasabuy/SettingsView';
import { AuditLogView } from './components/pasabuy/AuditLogView';

import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

const MainLayout: React.FC = () => {
  const { activeView, toasts, removeToast, isInitialized, isLoggedIn, login } = useApp();

  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 text-white">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-pink-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <h2 className="text-lg font-bold">Antique Pasabuy POS</h2>
          <p className="text-xs text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <LoginPage onLoginSuccess={(user, sessionId) => login(user, sessionId)} />;
  }

  const renderActiveView = () => {
    switch (activeView) {
      case 'dashboard':
        return <DashboardView />;
      case 'new-order':
        return <NewOrderView />;
      case 'buying-list':
        return <BuyingListView />;
      case 'orders':
        return <OrdersView />;
      case 'archive':
        return <ArchiveView />;
      case 'inventory':
        return <InventoryView />;
      case 'products':
        return <ProductsView />;
      case 'masterlist-all':
        return <MasterlistView section="all" />;
      case 'masterlist-orders':
        return <MasterlistView section="orders" />;
      case 'masterlist-payments':
        return <MasterlistView section="payments" />;
      case 'masterlist-expenses':
        return <MasterlistView section="expenses" />;
      case 'masterlist-inventory':
        return <MasterlistView section="inventory" />;
      case 'customers':
        return <CustomersView />;
      case 'expenses':
        return <ExpensesView />;
      case 'reports':
        return <ReportsView />;
      case 'settings':
        return <SettingsView />;
      case 'audit-logs':
        return <AuditLogView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-page)] antialiased text-slate-900">
      {/* Sidebar (Desktop & Tablet Collapsible Drawer) */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        {/* Top Header */}
        <Header />

        {/* Viewport Content */}
        {activeView === 'new-order' ? (
          // Full-height tap-box POS — no padding, no scroll wrapper
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            {renderActiveView()}
          </div>
        ) : (
          <main className="flex-1 overflow-y-auto px-4 py-5 md:px-8 md:py-6 pb-24 md:pb-8">
            <div className={`${activeView === 'dashboard' ? 'max-w-[1440px]' : 'max-w-7xl'} mx-auto`}>
              {renderActiveView()}
            </div>
          </main>
        )}

        {/* Mobile Bottom Navigation Bar (< 768px) */}
        <BottomNav />
      </div>

      {/* Thermal POS Receipt Modal Preview */}
      <ThermalReceiptModal />

      {/* Floating Toast Alerts */}
      <div className="fixed bottom-20 md:bottom-6 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-2xl shadow-xl text-xs font-semibold text-white animate-in slide-in-from-bottom-5 duration-200 ${t.type === 'success'
                ? 'bg-emerald-600'
                : t.type === 'error'
                  ? 'bg-rose-600'
                  : 'bg-slate-800'
              }`}
          >
            <div className="flex items-center gap-2">
              {t.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
              {t.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
              {t.type === 'info' && <Info className="w-4 h-4 shrink-0" />}
              <span>{t.message}</span>
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="p-1 hover:bg-white/20 rounded-lg shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}
