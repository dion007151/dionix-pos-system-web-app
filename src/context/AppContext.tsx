import React, { createContext, useContext, useState, useEffect } from 'react';
import { BusinessProfileId, User, Order, RestoOrder, BusinessInfo, DEFAULT_BUSINESS_INFO } from '../types';
import { db, seedInitialDatabase } from '../db/db';
import { logActivity } from '../services/auditService';
import { isSupabaseConfigured } from '../services/supabaseClient';
import { syncAllCloudData } from '../services/cloudSync';

export type ActiveView =
  | 'dashboard'
  | 'new-order'
  | 'buying-list'
  | 'orders'
  | 'inventory'
  | 'products'
  | 'masterlist-all'
  | 'masterlist-orders'
  | 'masterlist-payments'
  | 'masterlist-expenses'
  | 'masterlist-inventory'
  | 'archive'
  | 'customers'
  | 'expenses'
  | 'reports'
  | 'settings'
  | 'audit-logs'
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
  isLoggedIn: boolean;
  sessionId: string;
  login: (user: User, sessionId: string) => void;
  logout: () => void;
  logUserAction: (action: string, details?: string) => Promise<void>;
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
  businessInfo: BusinessInfo;
  updateBusinessInfo: (info: Partial<BusinessInfo>) => Promise<void>;
  resetBusinessInfo: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeProfile, setActiveProfileState] = useState<BusinessProfileId>('ANTIQUE_PASABUY');
  const [activeView, setActiveView] = useState<ActiveView>('dashboard');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  const [businessInfo, setBusinessInfo] = useState<BusinessInfo>(() => {
    try {
      const cached = localStorage.getItem('antique_business_info');
      if (cached) {
        return { ...DEFAULT_BUSINESS_INFO, ...JSON.parse(cached) };
      }
    } catch { }
    return DEFAULT_BUSINESS_INFO;
  });

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

        const savedInfo = await db.settings.get('business_info');
        if (savedInfo?.value) {
          try {
            const parsed = JSON.parse(savedInfo.value);
            setBusinessInfo(prev => ({ ...prev, ...parsed }));
            localStorage.setItem('antique_business_info', JSON.stringify({ ...DEFAULT_BUSINESS_INFO, ...parsed }));
          } catch { }
        }

        // Initial sync with cloud if configured
        if (isSupabaseConfigured() && navigator.onLine) {
          syncAllCloudData().catch(e => console.warn('Init cloud sync:', e));
        }
      } catch (err) {
        console.error('Database initialization error:', err);
      } finally {
        setIsInitialized(true);
      }
    }
    init();

    const handleOnline = () => {
      setIsOnline(true);
      if (isSupabaseConfigured()) {
        syncAllCloudData().catch(() => { });
      }
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic sync every 30 seconds if configured
    const syncInterval = setInterval(() => {
      if (navigator.onLine && isSupabaseConfigured()) {
        syncAllCloudData().catch(() => { });
      }
    }, 30000);

    return () => {
      clearInterval(syncInterval);
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

  const login = (user: User, sid: string) => {
    setCurrentUser(user);
    setSessionId(sid);
    setIsLoggedIn(true);
    setActiveView('dashboard');
    if (isSupabaseConfigured() && navigator.onLine) {
      syncAllCloudData().catch(() => { });
    }
  };

  const logout = async () => {
    if (currentUser && sessionId) {
      try {
        await logActivity(
          currentUser.id,
          currentUser.username,
          currentUser.fullName,
          currentUser.role,
          'LOGOUT',
          sessionId,
          'User logged out'
        );
      } catch (err) {
        console.error('Failed to log logout activity:', err);
      }
    }
    setIsLoggedIn(false);
    setCurrentUser(null);
    setSessionId('');
    setActiveView('dashboard');
  };

  const logUserAction = async (action: string, details?: string) => {
    if (currentUser) {
      try {
        await logActivity(
          currentUser.id,
          currentUser.username,
          currentUser.fullName,
          currentUser.role,
          action,
          sessionId || 'sess-unknown',
          details
        );
      } catch (err) {
        console.error('Failed to log user action:', err);
      }
    }
  };

  const updateBusinessInfo = async (patch: Partial<BusinessInfo>) => {
    const updated = { ...businessInfo, ...patch };
    setBusinessInfo(updated);
    try {
      localStorage.setItem('antique_business_info', JSON.stringify(updated));
      await db.settings.put({ key: 'business_info', value: JSON.stringify(updated) });
    } catch (err) {
      console.error('Failed to save business info:', err);
    }
  };

  const resetBusinessInfo = async () => {
    setBusinessInfo(DEFAULT_BUSINESS_INFO);
    try {
      localStorage.setItem('antique_business_info', JSON.stringify(DEFAULT_BUSINESS_INFO));
      await db.settings.put({ key: 'business_info', value: JSON.stringify(DEFAULT_BUSINESS_INFO) });
    } catch (err) {
      console.error('Failed to reset business info:', err);
    }
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
        isLoggedIn,
        sessionId,
        login,
        logout,
        logUserAction,
        isOnline,
        isMobileMenuOpen,
        setIsMobileMenuOpen,
        toasts,
        addToast,
        removeToast,
        receiptModal,
        openReceiptModal,
        closeReceiptModal,
        isInitialized,
        businessInfo,
        updateBusinessInfo,
        resetBusinessInfo
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
