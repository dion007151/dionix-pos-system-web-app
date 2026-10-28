import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, exportDatabaseToJson, importDatabaseFromJson } from '../../db/db';
import {
  Settings,
  Download,
  Upload,
  RotateCcw,
  Plus,
  Trash2,
  Building,
  ShieldCheck,
  CheckCircle,
  FileSpreadsheet
} from 'lucide-react';
import { DEFAULT_RATE_TIERS } from '../../services/calc';

export const SettingsView: React.FC = () => {
  const { addToast } = useApp();

  const rateTiers = useLiveQuery(() => db.rateTiers.toArray(), []);
  const stores = useLiveQuery(() => db.stores.toArray(), []);
  const settings = useLiveQuery(() => db.settings.toArray(), []);

  // New Store Input
  const [newStoreName, setNewStoreName] = useState<string>('');
  const [newStoreLocation, setNewStoreLocation] = useState<string>('San Jose de Buenavista');
  const [newStoreCategory, setNewStoreCategory] = useState<string>('Supermarket');

  // Receipt Footer
  const [receiptFooter, setReceiptFooter] = useState<string>(
    'Thank you for trusting Antique Pasabuy!'
  );

  // Reset Tiers to Default
  const handleResetTiers = async () => {
    if (!confirm('Reset Pasabuy rate table to official defaults?')) return;
    await db.rateTiers.clear();
    await db.rateTiers.bulkAdd(DEFAULT_RATE_TIERS);
    addToast('Pasabuy rates reset to official defaults', 'success');
  };

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Settings className="w-5 h-5 text-purple-700" />
          <span>System Settings & Local Data</span>
        </h2>
        <p className="text-xs text-slate-500">
          Pasabuy rate brackets, partner stores in Antique, and 100% free database backup.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Official Pasabuy Rates Table */}
        <div className="p-5 bg-white border border-slate-200/80 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Official Pasabuy Rates</h3>
              <p className="text-[11px] text-slate-400">
                Lower-bound brackets matching the official Antique Pasabuy rate table
              </p>
            </div>
            <button
              onClick={handleResetTiers}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2">Order Bracket</th>
                  <th className="px-3 py-2 text-right">Pasabuy Fee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {(rateTiers || DEFAULT_RATE_TIERS).map((tier, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="px-3 py-2 text-slate-800">
                      ₱{tier.minAmount}{' '}
                      {tier.maxAmount ? `to ₱${tier.maxAmount}` : 'and UP'}
                    </td>
                    <td className="px-3 py-2 text-right font-black text-purple-700">
                      {tier.fixedFee !== null && tier.fixedFee !== undefined
                        ? `₱${tier.fixedFee.toFixed(2)}`
                        : `${(tier.percentageFee! * 100).toFixed(0)}% of Subtotal`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: 1-Click Database Backup & Restore */}
        <div className="p-5 bg-white border border-slate-200/80 rounded-2xl shadow-xs space-y-4">
          <div className="pb-2 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>1-Click Database Backup & Restore</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Your data is stored safely in your device's IndexedDB. Export anytime to keep a copy on your phone or Google Drive.
            </p>
          </div>

          <div className="p-4 bg-purple-50/50 border border-purple-100 rounded-xl space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white rounded-xl shadow-xs text-purple-700">
                <Download className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="text-xs font-bold text-slate-900">Download Complete JSON Backup</h4>
                <p className="text-[11px] text-slate-500">
                  Exports all orders, items, products, customers, stores, and expenses.
                </p>
              </div>
            </div>

            <button
              onClick={handleExportBackup}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-white bg-[#452B86] hover:bg-[#5B43E8] rounded-xl shadow-xs transition-all active:scale-95"
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

      {/* Stores Directory Management */}
      <div className="p-5 bg-white border border-slate-200/80 rounded-2xl shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Building className="w-4 h-4 text-purple-700" />
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
            className="flex items-center justify-center gap-1 py-1.5 text-xs font-bold text-white bg-[#452B86] hover:bg-[#5B43E8] rounded-lg shadow-xs"
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
              className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs hover:border-purple-200"
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
    </div>
  );
};
