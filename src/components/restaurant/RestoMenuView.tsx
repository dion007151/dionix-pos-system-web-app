import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import {
  BookOpen,
  Plus,
  Search,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { RestoMenuItem } from '../../types';

export const RestoMenuView: React.FC = () => {
  const { addToast } = useApp();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Modal State
  const [showModal, setShowModal] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<RestoMenuItem | null>(null);

  const [code, setCode] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [category, setCategory] = useState<string>('Grill');
  const [price, setPrice] = useState<string>('');
  const [costPrice, setCostPrice] = useState<string>('');
  const [isAvailable, setIsAvailable] = useState<boolean>(true);

  const menuItems = useLiveQuery(() => db.restoMenuItems.toArray(), []);

  const categories = Array.from(
    new Set((menuItems || []).map(m => m.category).filter(Boolean))
  );

  const filteredItems = (menuItems || []).filter(item => {
    const matchesCat = selectedCategory === 'ALL' || item.category === selectedCategory;
    const matchesSearch =
      !searchQuery ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.code.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const handleOpenAdd = () => {
    setEditingItem(null);
    const count = (menuItems?.length || 0) + 1;
    setCode(`ITEM-${String(count).padStart(2, '0')}`);
    setName('');
    setCategory('Grill');
    setPrice('');
    setCostPrice('');
    setIsAvailable(true);
    setShowModal(true);
  };

  const handleOpenEdit = (item: RestoMenuItem) => {
    setEditingItem(item);
    setCode(item.code);
    setName(item.name);
    setCategory(item.category);
    setPrice(String(item.price));
    setCostPrice(String(item.costPrice || ''));
    setIsAvailable(item.isAvailable);
    setShowModal(true);
  };

  const handleToggleAvailable = async (item: RestoMenuItem) => {
    await db.restoMenuItems.update(item.id, {
      isAvailable: !item.isAvailable
    });
    addToast(`${item.name} marked as ${!item.isAvailable ? 'Available' : 'Sold Out'}`, 'info');
  };

  const handleSave = async () => {
    if (!name.trim()) {
      addToast('Item name is required', 'error');
      return;
    }
    const numPrice = parseFloat(price);
    if (isNaN(numPrice) || numPrice < 0) {
      addToast('Please enter a valid price', 'error');
      return;
    }

    if (editingItem) {
      await db.restoMenuItems.update(editingItem.id, {
        code: code.trim(),
        name: name.trim(),
        category,
        price: numPrice,
        costPrice: parseFloat(costPrice) || 0,
        isAvailable
      });
      addToast(`Updated "${name}"`, 'success');
    } else {
      const newItem: RestoMenuItem = {
        id: 'rm-' + Math.random().toString(36).substring(2, 9),
        code: code.trim(),
        name: name.trim(),
        category,
        price: numPrice,
        costPrice: parseFloat(costPrice) || 0,
        isAvailable
      };
      await db.restoMenuItems.add(newItem);
      addToast(`Added "${name}" to menu`, 'success');
    }

    setShowModal(false);
  };

  const handleDelete = async (item: RestoMenuItem) => {
    if (!confirm(`Delete ${item.name} from menu?`)) return;
    await db.restoMenuItems.delete(item.id);
    addToast(`Deleted "${item.name}"`, 'info');
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#8B5E5E]" />
            <span>Restaurant Menu Catalog</span>
          </h2>
          <p className="text-xs text-slate-500">
            Grill specialties, sizzling platters, pulutan, beverages, and rice.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#291818] hover:bg-[#4A2C2C] rounded-xl shadow-xs transition-all active:scale-95 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Menu Item</span>
        </button>
      </div>

      {/* Filter and Search */}
      <div className="bg-white p-3.5 border border-slate-200/80 rounded-2xl shadow-xs flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search menu item name or code..."
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
            All Items
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

      {/* Items Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredItems.map(item => (
          <div
            key={item.id}
            className={`p-4 bg-white border rounded-2xl shadow-xs transition-all flex flex-col justify-between ${
              item.isAvailable ? 'border-slate-200' : 'border-slate-200 bg-slate-50/50 opacity-75'
            }`}
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-bold text-amber-900 bg-amber-50 px-2 py-0.5 rounded-md">
                  {item.code}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    item.isAvailable
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {item.isAvailable ? 'Available' : 'Sold Out'}
                </span>
              </div>

              <h3 className="font-bold text-sm text-slate-900">{item.name}</h3>
              <p className="text-[11px] text-slate-400 uppercase font-semibold">
                {item.category}
              </p>
            </div>

            <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100">
              <div>
                <span className="text-[10px] text-slate-400 block font-semibold">Selling Price</span>
                <span className="text-base font-black text-slate-900">
                  ₱{item.price.toFixed(2)}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleToggleAvailable(item)}
                  className={`p-1.5 rounded-lg text-xs font-semibold ${
                    item.isAvailable
                      ? 'text-rose-600 hover:bg-rose-50'
                      : 'text-emerald-600 hover:bg-emerald-50'
                  }`}
                  title={item.isAvailable ? 'Mark Sold Out' : 'Mark Available'}
                >
                  {item.isAvailable ? (
                    <XCircle className="w-4 h-4" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={() => handleOpenEdit(item)}
                  className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
                  title="Edit Menu Item"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(item)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                  title="Delete Menu Item"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-5 border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              {editingItem ? 'Edit Menu Item' : 'Add New Menu Item'}
            </h3>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Code</label>
                  <input
                    type="text"
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                  <input
                    type="text"
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    placeholder="Grill, Sizzling, Pulutan"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Item Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Sizzling Bulalo Steak"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Selling Price (₱) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cost Price (₱)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={costPrice}
                    onChange={e => setCostPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAvailable}
                    onChange={e => setIsAvailable(e.target.checked)}
                    className="rounded text-[#291818]"
                  />
                  <span>Currently Available in Kitchen</span>
                </label>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="flex-1 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="flex-1 py-2 text-xs font-bold text-white bg-[#291818] rounded-xl hover:bg-[#4A2C2C] shadow-xs"
              >
                Save Menu Item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
