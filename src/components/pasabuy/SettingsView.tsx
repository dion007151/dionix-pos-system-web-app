import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, exportDatabaseToJson, importDatabaseFromJson, resetSystemToScratch } from '../../db/db';
import {
  Settings,
  Download,
  Upload,
  Plus,
  Trash2,
  Building,
  ShieldCheck,
  Receipt,
  RotateCcw,
  Check,
  AlertTriangle,
  Eye,
  EyeOff,
  KeyRound,
  ShieldAlert,
  Cloud,
  RefreshCw,
  Copy,
  ExternalLink,
  Database,
  X
} from 'lucide-react';
import {
  isSupabaseConfigured,
  getSavedSupabaseConfig,
  saveSupabaseConfig,
  clearSupabaseConfig
} from '../../services/supabaseClient';
import {
  SUPABASE_SCHEMA_SQL,
  testSupabaseConnection,
  syncAllCloudData
} from '../../services/cloudSync';

export const SettingsView: React.FC = () => {
  const { businessInfo, updateBusinessInfo, resetBusinessInfo, addToast, currentUser, logUserAction } = useApp();
  const isAdmin = currentUser?.role === 'Admin';

  const stores = useLiveQuery(() => db.stores.toArray(), []);

  // Business Info Form State
  const [storeName, setStoreName] = useState(businessInfo.storeName);
  const [tagline, setTagline] = useState(businessInfo.tagline);
  const [address, setAddress] = useState(businessInfo.address);
  const [phone, setPhone] = useState(businessInfo.phone);
  const [email, setEmail] = useState(businessInfo.email);
  const [receiptFooter, setReceiptFooter] = useState(businessInfo.receiptFooter);
  const [isSavingInfo, setIsSavingInfo] = useState(false);

  // Reset to Scratch (Admin only) state
  const [showResetModal, setShowResetModal] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isWiping, setIsWiping] = useState(false);
  const [resetError, setResetError] = useState('');

  // Cloud Sync State
  const [cloudUrl, setCloudUrl] = useState(() => getSavedSupabaseConfig()?.url || '');
  const [cloudKey, setCloudKey] = useState(() => getSavedSupabaseConfig()?.anonKey || '');
  const [isCloudConnected, setIsCloudConnected] = useState(() => isSupabaseConfigured());
  const [isTestingCloud, setIsTestingCloud] = useState(false);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [cloudMessage, setCloudMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  useEffect(() => {
    setStoreName(businessInfo.storeName);
    setTagline(businessInfo.tagline);
    setAddress(businessInfo.address);
    setPhone(businessInfo.phone);
    setEmail(businessInfo.email);
    setReceiptFooter(businessInfo.receiptFooter);
  }, [businessInfo]);

  const handleSaveBusinessInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingInfo(true);
    try {
      await updateBusinessInfo({
        storeName: storeName.trim() || 'ANTIQUE PASABUY & RETAIL',
        tagline: tagline.trim() || 'YOUR SHOPPER',
        address: address.trim(),
        phone: phone.trim(),
        email: email.trim(),
        receiptFooter: receiptFooter.trim()
      });
      addToast('Receipt and invoice info updated successfully!', 'success');
    } catch {
      addToast('Failed to save receipt info', 'error');
    } finally {
      setIsSavingInfo(false);
    }
  };

  const handleResetBusinessInfo = async () => {
    if (!confirm('Reset receipt and invoice info to default values?')) return;
    await resetBusinessInfo();
    addToast('Reset to default receipt info', 'info');
  };

  const handleOpenResetModal = () => {
    setAdminPasswordInput('');
    setResetError('');
    setShowPassword(false);
    setShowResetModal(true);
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');

    if (!currentUser || currentUser.role !== 'Admin') {
      setResetError('Only administrators are authorized to delete all data.');
      return;
    }

    if (!adminPasswordInput.trim()) {
      setResetError('Please enter your admin password.');
      return;
    }

    setIsWiping(true);
    try {
      const adminRecord = await db.users.get(currentUser.id);
      if (!adminRecord || adminRecord.password !== adminPasswordInput) {
        setResetError('Incorrect admin password. Action blocked for security.');
        setIsWiping(false);
        return;
      }

      await resetSystemToScratch(currentUser.id);
      await logUserAction('SYSTEM_RESET_SCRATCH', 'Admin cleared all system data from scratch');

      localStorage.removeItem('dionix_active_order');
      localStorage.removeItem('pos_cart');

      addToast('All data deleted from scratch successfully.', 'success');
      setShowResetModal(false);

      setTimeout(() => {
        window.location.reload();
      }, 700);
    } catch (err: any) {
      console.error('System reset error:', err);
      setResetError(err.message || 'Failed to reset system data.');
    } finally {
      setIsWiping(false);
    }
  };

  // New Store Input
  const [newStoreName, setNewStoreName] = useState<string>('');
  const [newStoreLocation, setNewStoreLocation] = useState<string>('San Jose de Buenavista');
  const [newStoreCategory, setNewStoreCategory] = useState<string>('Supermarket');

  // Add Store
  const handleAddStore = async () => {
    if (!newStoreName.trim()) {
      addToast('Store name is required', 'error');
      return;
    }
    await db.stores.add({
      id: 's-' + Math.random().toString(36).substring(2, 9),
      name: newStoreName.trim(),
      location: newStoreLocation.trim(),
      category: newStoreCategory.trim()
    });
    setNewStoreName('');
    addToast(`Store "${newStoreName}" added`, 'success');
  };

  const handleDeleteStore = async (storeId: string, storeName: string) => {
    if (!confirm(`Delete store "${storeName}"?`)) return;
    await db.stores.delete(storeId);
    addToast(`Store "${storeName}" deleted`, 'info');
  };

  // 1-Click Backup Export
  const handleExportBackup = async () => {
    try {
      const json = await exportDatabaseToJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      link.download = `antique_pasabuy_backup_${dateStr}.json`;
      link.click();
      URL.revokeObjectURL(url);
      addToast('Backup downloaded successfully!', 'success');
    } catch (err) {
      console.error(err);
      addToast('Failed to export backup', 'error');
    }
  };

  // Restore Backup
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async event => {
      try {
        const content = event.target?.result as string;
        if (!confirm('Restoring this backup will replace current database. Proceed?')) return;
        await importDatabaseFromJson(content);
        addToast('Database restored successfully! Reloading...', 'success');
        setTimeout(() => window.location.reload(), 1000);
      } catch (err) {
        console.error(err);
        addToast('Invalid backup file format', 'error');
      }
    };
    reader.readAsText(file);
  };

  // Cloud Sync Handlers
  const handleSaveAndConnectCloud = async () => {
    if (!cloudUrl.trim() || !cloudKey.trim()) {
      setCloudMessage({ type: 'error', text: 'Please provide both Supabase URL and Anon Key.' });
      return;
    }
    setIsTestingCloud(true);
    setCloudMessage(null);
    try {
      saveSupabaseConfig(cloudUrl.trim(), cloudKey.trim());
      const test = await testSupabaseConnection();
      if (!test.success) {
        setCloudMessage({ type: 'error', text: test.message });
        setIsCloudConnected(false);
        return;
      }
      setIsCloudConnected(true);
      setCloudMessage({ type: 'success', text: 'Supabase connected! Syncing data...' });

      const syncRes = await syncAllCloudData();
      if (syncRes.success) {
        setCloudMessage({
          type: 'success',
          text: `Connected & Synced! (${syncRes.usersSynced} users, ${syncRes.ordersSynced} orders synced).`
        });
        addToast('Cloud sync connected and up to date!', 'success');
      } else {
        setCloudMessage({ type: 'error', text: syncRes.message || 'Sync failed.' });
      }
    } catch (err: any) {
      setCloudMessage({ type: 'error', text: err.message || 'Connection failed' });
    } finally {
      setIsTestingCloud(false);
    }
  };

  const handleTestCloudConnection = async () => {
    if (!cloudUrl.trim() || !cloudKey.trim()) {
      setCloudMessage({ type: 'error', text: 'Please enter URL and Anon Key first.' });
      return;
    }
    setIsTestingCloud(true);
    setCloudMessage(null);
    try {
      saveSupabaseConfig(cloudUrl.trim(), cloudKey.trim());
      const test = await testSupabaseConnection();
      if (test.success) {
        setIsCloudConnected(true);
        setCloudMessage({ type: 'success', text: 'Connection successful! Database tables are ready.' });
        addToast('Connected to Supabase!', 'success');
      } else {
        setIsCloudConnected(false);
        setCloudMessage({ type: 'error', text: test.message });
      }
    } catch (err: any) {
      setCloudMessage({ type: 'error', text: err.message || 'Connection test failed' });
    } finally {
      setIsTestingCloud(false);
    }
  };

  const handleSyncCloudNow = async () => {
    if (!isCloudConnected) {
      setCloudMessage({ type: 'error', text: 'Please connect to Supabase first.' });
      return;
    }
    setIsSyncingCloud(true);
    setCloudMessage(null);
    try {
      const res = await syncAllCloudData();
      if (res.success) {
        setCloudMessage({
          type: 'success',
          text: `Sync complete! Synced ${res.usersSynced} users and ${res.ordersSynced} orders.`
        });
        addToast('Multi-device sync completed successfully!', 'success');
      } else {
        setCloudMessage({ type: 'error', text: res.message || 'Sync failed.' });
      }
    } catch (err: any) {
      setCloudMessage({ type: 'error', text: err.message || 'Sync failed.' });
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const handleDisconnectCloud = () => {
    if (!confirm('Disconnect Supabase cloud sync? Your local data will remain intact.')) return;
    clearSupabaseConfig();
    setIsCloudConnected(false);
    setCloudUrl('');
    setCloudKey('');
    setCloudMessage(null);
    addToast('Disconnected from Supabase cloud.', 'info');
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SCHEMA_SQL);
    setCopiedSql(true);
    addToast('SQL Schema copied to clipboard!', 'success');
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Settings className="w-5 h-5 text-pink-700" />
          <span>System Settings & Data Backup</span>
        </h2>
        <p className="text-xs text-slate-500">
          Customize receipt and invoice details, manage partner stores, and backup your data.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Receipt & Invoice Store Details */}
        <div className="p-5 bg-white border border-slate-200/80 rounded-2xl shadow-xs space-y-4">
          <div className="pb-2 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-pink-700" />
                <span>Thermal Receipt & Invoice Information</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Customize the store name, address, phone, and email printed on receipts and invoices.
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetBusinessInfo}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              title="Reset to default Antique Pasabuy details"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>

          <form onSubmit={handleSaveBusinessInfo} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Business / Store Name
                </label>
                <input
                  type="text"
                  value={storeName}
                  onChange={e => setStoreName(e.target.value)}
                  placeholder="e.g. ANTIQUE PASABUY & RETAIL"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-pink-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Tagline / Header Title
                </label>
                <input
                  type="text"
                  value={tagline}
                  onChange={e => setTagline(e.target.value)}
                  placeholder="e.g. YOUR SHOPPER"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-pink-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Store Address
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="e.g. San Angel, San Jose de Buenavista, Antique 5700"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-pink-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Mobile Number
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="e.g. 09054853573"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-pink-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="e.g. ellimac07161993@gmail.com"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-pink-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Receipt Footer Notice
                </label>
                <input
                  type="text"
                  value={receiptFooter}
                  onChange={e => setReceiptFooter(e.target.value)}
                  placeholder="e.g. *** OFFICIAL RECEIPT ***"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-pink-500"
                />
              </div>
            </div>

            {/* Live Preview Box */}
            <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-center font-mono text-[11px] space-y-0.5">
              <span className="text-[9px] font-bold uppercase text-slate-400 font-sans block mb-1">
                Live Header Preview
              </span>
              <p className="font-bold text-slate-900">{storeName || 'ANTIQUE PASABUY & RETAIL'}</p>
              <p className="text-slate-600 text-[10px]">{address || 'San Angel, San Jose de Buenavista, Antique 5700'}</p>
              <p className="text-slate-600 text-[10px]">Mobile: {phone || '09054853573'}</p>
              {email && <p className="text-slate-600 text-[10px]">{email}</p>}
              <p className="text-[9.5px] text-slate-400 font-sans pt-0.5">{receiptFooter || '*** OFFICIAL RECEIPT ***'}</p>
            </div>

            <button
              type="submit"
              disabled={isSavingInfo}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-white bg-[#C90052] hover:bg-[#E60063] rounded-xl shadow-xs transition-all active:scale-95 disabled:opacity-60"
            >
              <Check className="w-4 h-4" />
              <span>{isSavingInfo ? 'Saving...' : 'Save Receipt & Invoice Details'}</span>
            </button>
          </form>
        </div>
        {/* Right: Database Backup & Restore */}
        <div className="p-5 bg-white border border-slate-200/80 rounded-2xl shadow-xs space-y-4">
          <div className="pb-2 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Data Backup & Restore</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Save a backup copy of your system data, or restore from a previously exported file.
            </p>
          </div>

          <div className="p-4 bg-pink-50/50 border border-pink-100 rounded-xl space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white rounded-xl shadow-xs text-pink-700">
                <Download className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="text-xs font-bold text-slate-900">Export Backup</h4>
                <p className="text-[11px] text-slate-500">
                  Saves all orders, items, products, customers, and expenses.
                </p>
              </div>
            </div>

            <button
              onClick={handleExportBackup}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-white bg-[#C90052] hover:bg-[#E60063] rounded-xl shadow-xs transition-all active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>Download Backup File</span>
            </button>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white rounded-xl shadow-xs text-slate-700">
                <Upload className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="text-xs font-bold text-slate-900">Restore from Backup</h4>
                <p className="text-[11px] text-slate-500">
                  Upload a previously saved `.json` file to restore all POS records.
                </p>
              </div>
            </div>

            <label className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl shadow-xs cursor-pointer transition-all">
              <Upload className="w-4 h-4" />
              <span>Choose Backup File (.json)</span>
              <input
                type="file"
                accept=".json"
                onChange={handleImportBackup}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Cloud Sync Section: Multi-Device Sync (Phone & PC) */}
      <div className="p-5 bg-white border border-slate-200/80 rounded-2xl shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-pink-50 rounded-xl text-pink-700">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Multi-Device Cloud Sync (Phone & PC)
                </h3>
                <span
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${isCloudConnected
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-600'
                    }`}
                >
                  {isCloudConnected ? '● Connected' : '○ Not Connected'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Connect to Supabase to keep all your user accounts, orders, items, and inventory synced in real-time across your laptop, phone, and tablet.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowSqlModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              <Database className="w-3.5 h-3.5" />
              <span>Setup Guide & SQL</span>
            </button>
            {isCloudConnected && (
              <button
                type="button"
                disabled={isSyncingCloud}
                onClick={handleSyncCloudNow}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[#C90052] hover:bg-[#B5004A] rounded-xl shadow-xs transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCloud ? 'animate-spin' : ''}`} />
                <span>{isSyncingCloud ? 'Syncing...' : 'Sync Now'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Input fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Supabase Project URL
            </label>
            <input
              type="text"
              value={cloudUrl}
              onChange={e => setCloudUrl(e.target.value)}
              placeholder="https://your-project-id.supabase.co"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#C90052]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Supabase Anon Public API Key
            </label>
            <input
              type="text"
              value={cloudKey}
              onChange={e => setCloudKey(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-[#C90052] font-mono"
            />
          </div>
        </div>

        {cloudMessage && (
          <div
            className={`p-3 rounded-xl text-xs flex items-start gap-2 font-medium ${cloudMessage.type === 'success'
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border border-rose-200 text-rose-800'
              }`}
          >
            {cloudMessage.type === 'success' ? (
              <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            )}
            <span className="leading-relaxed">{cloudMessage.text}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="text-[11px] text-slate-400">
            Tip: You can also set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in Vercel Environment Variables so every device auto-connects.
          </div>

          <div className="flex items-center gap-2">
            {isCloudConnected && (
              <button
                type="button"
                onClick={handleDisconnectCloud}
                className="px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
              >
                Disconnect
              </button>
            )}
            <button
              type="button"
              disabled={isTestingCloud}
              onClick={handleTestCloudConnection}
              className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors disabled:opacity-50"
            >
              {isTestingCloud ? 'Testing...' : 'Test Connection'}
            </button>
            <button
              type="button"
              disabled={isTestingCloud || isSyncingCloud}
              onClick={handleSaveAndConnectCloud}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#C90052] hover:bg-[#B5004A] rounded-xl shadow-xs transition-all disabled:opacity-50"
            >
              <Cloud className="w-3.5 h-3.5" />
              <span>{isTestingCloud ? 'Connecting...' : 'Save & Connect Cloud'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* SQL Setup Modal */}
      {showSqlModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl p-6 border border-slate-200 space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-pink-50 rounded-xl text-pink-700">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">1-Minute Supabase Setup</h3>
                  <p className="text-[11px] text-slate-500">Run this once in your Supabase project</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSqlModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600 leading-relaxed overflow-y-auto flex-1 pr-1">
              <ol className="list-decimal list-inside space-y-1.5 font-medium text-slate-700">
                <li>Create a free account at <a href="https://supabase.com" target="_blank" rel="noreferrer" className="text-pink-700 underline inline-flex items-center gap-0.5">supabase.com <ExternalLink className="w-3 h-3" /></a> and click <strong>New Project</strong>.</li>
                <li>Go to the <strong>SQL Editor</strong> tab on the left sidebar.</li>
                <li>Paste the script below and click <strong>Run</strong> (creates <code>pos_users</code>, <code>pos_orders</code>, <code>pos_products</code>, <code>pos_customers</code>).</li>
                <li>Go to <strong>Project Settings → API</strong>, copy the <strong>Project URL</strong> and <strong>anon public API key</strong>, and paste them here!</li>
              </ol>

              <div className="relative pt-2">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">SQL Schema Script</span>
                  <button
                    type="button"
                    onClick={handleCopySql}
                    className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-pink-700 bg-pink-50 hover:bg-pink-100 rounded-lg transition-colors"
                  >
                    {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedSql ? 'Copied to Clipboard!' : 'Copy SQL Script'}</span>
                  </button>
                </div>
                <pre className="p-3 bg-slate-900 text-slate-100 rounded-xl text-[11px] font-mono overflow-x-auto max-h-56 leading-relaxed border border-slate-800">
                  {SUPABASE_SCHEMA_SQL}
                </pre>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowSqlModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stores Directory Management */}
      <div className="p-5 bg-white border border-slate-200/80 rounded-2xl shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Building className="w-4 h-4 text-pink-700" />
            <span>Stores & Supermarkets in Antique</span>
          </h3>
          <p className="text-[11px] text-slate-400">
            Partner stores where pasabuy shoppers buy groceries and items.
          </p>
        </div>

        {/* Add Store Form */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end p-3 bg-slate-50 rounded-xl border border-slate-200">
          <div className="sm:col-span-2">
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              Store Name *
            </label>
            <input
              type="text"
              value={newStoreName}
              onChange={e => setNewStoreName(e.target.value)}
              placeholder="e.g. Puregold Antique, Gaisano Grand"
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              Location
            </label>
            <input
              type="text"
              value={newStoreLocation}
              onChange={e => setNewStoreLocation(e.target.value)}
              placeholder="e.g. San Jose, Sibalom"
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none"
            />
          </div>

          <button
            onClick={handleAddStore}
            className="flex items-center justify-center gap-1 py-1.5 text-xs font-bold text-white bg-[#C90052] hover:bg-[#E60063] rounded-lg shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Add Store</span>
          </button>
        </div>

        {/* Store Chips */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {(stores || []).map(s => (
            <div
              key={s.id}
              className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs hover:border-pink-200"
            >
              <div>
                <span className="font-bold text-slate-900 block">{s.name}</span>
                <span className="text-[10px] text-slate-400">{s.location || 'Antique'}</span>
              </div>
              <button
                onClick={() => handleDeleteStore(s.id, s.name)}
                className="p-1 text-slate-300 hover:text-rose-600 rounded-md"
                title="Delete Store"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Danger Zone: Delete All Data From Scratch (Admin Only) */}
      {
        isAdmin && (
          <div className="p-5 bg-rose-50/50 border border-rose-200 rounded-2xl shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-rose-100 rounded-xl text-rose-700 shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-rose-950">
                      Delete All Data (From Scratch)
                    </h3>
                    <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-rose-200 text-rose-900 rounded-md">
                      Admin Only
                    </span>
                  </div>
                  <p className="text-xs text-rose-700/90 mt-1 leading-relaxed">
                    Permanently delete all orders, items, payments, customers, products, stock movements, and expenses. Your administrator login account will be preserved for security.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleOpenResetModal}
                className="flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:scale-95 rounded-xl shadow-xs transition-all shrink-0"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Everything from Scratch...</span>
              </button>
            </div>
          </div>
        )
      }

      {/* Admin Password Confirmation Modal */}
      {
        showResetModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="reset-modal-title">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 border border-slate-200 space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-rose-100 rounded-xl text-rose-600 shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 id="reset-modal-title" className="text-base font-bold text-slate-900">
                    Delete All Data from Scratch?
                  </h3>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    This will <strong className="text-rose-600">permanently delete</strong> all orders, customers, inventory records, and expenses. This action cannot be undone.
                  </p>
                </div>
              </div>

              <form onSubmit={handleConfirmReset} className="space-y-4 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-800 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-slate-500" />
                    <span>Enter Admin Password to Authorize</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoFocus
                      required
                      value={adminPasswordInput}
                      onChange={e => {
                        setAdminPasswordInput(e.target.value);
                        if (resetError) setResetError('');
                      }}
                      placeholder="Enter your administrator password"
                      className="w-full pl-3 pr-10 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-700"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {resetError && (
                    <p className="text-xs font-semibold text-rose-600 mt-1.5 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>{resetError}</span>
                    </p>
                  )}
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    disabled={isWiping}
                    onClick={() => setShowResetModal(false)}
                    className="flex-1 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isWiping || !adminPasswordInput.trim()}
                    className="flex-1 py-2.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5"
                  >
                    {isWiping ? (
                      <span>Deleting Data...</span>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        <span>Confirm &amp; Delete All</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      }
    </div >
  );
};
