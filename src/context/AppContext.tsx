import React, { createContext, useContext, useState, useEffect } from 'react';
import { BusinessProfileId, User, Order, RestoOrder } from '../types';
import { db, seedInitialDatabase } from '../db/db';

export type ActiveView =
  | 'dashboard'
  | 'new-order'
  | 'buying-list'
  | 'orders'
  | 'inventory'
  | 'products'
  | 'customers'
  | 'expenses'
  | 'reports'
  | 'settings'
  // Restaurant mode views
  | 'resto-register'
  | 'resto-tables'
  | 'resto-kitchen'
  | 'resto-menu'
  | 'resto-inventory'
  | 'resto-staff';

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface AppContextType {
  activeProfile: BusinessProfileId;
  setActiveProfile: (profile: BusinessProfileId) => void;
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  isOnline: boolean;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
  toasts: ToastMessage[];
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
  receiptModal: {
    isOpen: boolean;
    order?: Order;
    restoOrder?: RestoOrder;
  };
  openReceiptModal: (data: { order?: Order; restoOrder?: RestoOrder }) => void;
  closeReceiptModal: () => void;
  isInitialized: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeProfile, setActiveProfileState] = useState<BusinessProfileId>('ANTIQUE_PASABUY');
  const [activeView, setActiveView] = useState<ActiveView>('dashboard');
  const [currentUser, setCurrentUser] = useState<User | null>({
    id: 'usr-1',
    username: 'admin',
    fullName: 'Administrator',
    role: 'Admin',
    isActive: true
  });
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  const [receiptModal, setReceiptModal] = useState<{
    isOpen: boolean;
    order?: Order;
    restoOrder?: RestoOrder;
  }>({ isOpen: false });

  // Initialize DB and settings
  useEffect(() => {
    async function init() {
      try {
        await seedInitialDatabase();
        const savedProfile = await db.settings.get('active_business_profile');
        if (savedProfile && (savedProfile.value === 'ANTIQUE_PASABUY' || savedProfile.value === 'ANGELITOS_RESTO')) {
          setActiveProfileState(savedProfile.value as BusinessProfileId);
          if (savedProfile.value === 'ANGELITOS_RESTO') {
            setActiveView('resto-register');
          }
        }
      } catch (err) {
        console.error('Database initialization error:', err);
      } finally {
        setIsInitialized(true);
      }
    }
    init();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const setActiveProfile = async (profile: BusinessProfileId) => {
    setActiveProfileState(profile);
    document.documentElement.setAttribute('data-business', profile);
    await db.settings.put({ key: 'active_business_profile', value: profile });

    if (profile === 'ANGELITOS_RESTO') {
      setActiveView('resto-register');
    } else {
      setActiveView('dashboard');
    }
  };

  const addToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      removeToast(id);
    }, 3500);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const openReceiptModal = (data: { order?: Order; restoOrder?: RestoOrder }) => {
    setReceiptModal({ isOpen: true, ...data });
  };

  const closeReceiptModal = () => {
    setReceiptModal({ isOpen: false });
  };

  return (
    <AppContext.Provider
      value={{
        activeProfile,
        setActiveProfile,
        activeView,
        setActiveView,
        currentUser,
        setCurrentUser,
        isOnline,
        isMobileMenuOpen,
        setIsMobileMenuOpen,
        toasts,
        addToast,
        removeToast,
        receiptModal,
        openReceiptModal,
        closeReceiptModal,
        isInitialized
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
