import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import {
  Tag,
  Search,
  Plus,
  Edit2,
  Trash2,
  Barcode,
  Boxes,
  Store as StoreIcon
} from 'lucide-react';
import { Product, ProductFeeType } from '../../types';

export const ProductsView: React.FC = () => {
  const { addToast } = useApp();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Modal State
  const [showModal, setShowModal] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form Fields
  const [name, setName] = useState<string>('');
  const [category, setCategory] = useState<string>('Groceries');
  const [store, setStore] = useState<string>('SM');
  const [price, setPrice] = useState<string>('');
  const [costPrice, setCostPrice] = useState<string>('');
  const [unit, setUnit] = useState<string>('pc');
  const [barcode, setBarcode] = useState<string>('');
  const [feeType, setFeeType] = useState<ProductFeeType>('STANDARD');

  // Inventory fields
  const [isStockItem, setIsStockItem] = useState<boolean>(false);
  const [stockQuantity, setStockQuantity] = useState<string>('0');
  const [minStockLevel, setMinStockLevel] = useState<string>('5');

  const products = useLiveQuery(() => db.products.toArray(), []);
  const stores = useLiveQuery(() => db.stores.toArray(), []);

  // Distinct Categories
  const categories = Array.from(
    new Set((products || []).map(p => p.category).filter(Boolean))
  );

  // Filtered Products
  const filteredProducts = (products || []).filter(p => {
    const matchesCat = selectedCategory === 'ALL' || p.category === selectedCategory;
    const matchesSearch =
      !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.barcode && p.barcode.includes(searchQuery)) ||
      (p.store && p.store.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesCat && matchesSearch;
  });

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setName('');
    setCategory('Groceries');
    setStore(stores && stores.length > 0 ? stores[0].name : 'SM');
    setPrice('');
    setCostPrice('');
    setUnit('pc');
    setBarcode('');
    setFeeType('STANDARD');
    setIsStockItem(false);
    setStockQuantity('0');
    setMinStockLevel('5');
    setShowModal(true);
  };

  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    setName(p.name);
    setCategory(p.category);
    setStore(p.store);
    setPrice(String(p.price));
    setCostPrice(String(p.costPrice || ''));
    setUnit(p.unit);
    setBarcode(p.barcode || '');
    setFeeType(p.feeType || 'STANDARD');
    setIsStockItem(Boolean(p.isStockItem));
    setStockQuantity(String(p.stockQuantity || 0));
    setMinStockLevel(String(p.minStockLevel || 5));
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      addToast('Product name is required', 'error');
      return;
    }
    const numPrice = parseFloat(price);
    if (isNaN(numPrice) || numPrice < 0) {
      addToast('Please enter a valid price', 'error');
      return;
    }

    const numStock = parseFloat(stockQuantity) || 0;
    const numCost = parseFloat(costPrice) || 0;
    const numMin = parseFloat(minStockLevel) || 5;

    if (editingProduct) {
      await db.products.update(editingProduct.id, {
        name: name.trim(),
        category,
        store,
        price: numPrice,
        costPrice: numCost,
        unit,
        barcode: barcode.trim() || undefined,
        feeType,
        isStockItem,
        stockQuantity: numStock,
        minStockLevel: numMin
      });
      addToast(`Updated "${name}"`, 'success');
    } else {
      const newProduct: Product = {
        id: 'p-' + Math.random().toString(36).substring(2, 9),
        name: name.trim(),
        category,
        store,
        price: numPrice,
        costPrice: numCost,
        unit,
        barcode: barcode.trim() || undefined,
        feeType,
        isStockItem,
        openingStock: numStock,
        additionalStocks: 0,
        stockQuantity: numStock,
        minStockLevel: numMin
      };
      await db.products.add(newProduct);
      addToast(`Added "${name}" to catalog`, 'success');
    }

    setShowModal(false);
  };

  const handleDelete = async (p: Product) => {
    if (!confirm(`Are you sure you want to delete ${p.name}?`)) return;
    await db.products.delete(p.id);
    addToast(`Deleted "${p.name}"`, 'info');
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Tag className="w-5 h-5 text-purple-700" />
            <span>Products & Supermarket Catalog</span>
          </h2>
          <p className="text-xs text-slate-500">
            Pre-defined prices, stores, barcodes, and on-hand inventory settings in Antique.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#452B86] hover:bg-[#5B43E8] rounded-xl shadow-xs transition-all active:scale-95 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Product</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 border border-slate-200/80 rounded-2xl shadow-xs flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by product name, barcode, or store..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
          />
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
              selectedCategory === 'ALL'
                ? 'bg-[#452B86] text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Categories
          </button>
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setSelectedCategory(c)}
              className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-all ${
                selectedCategory === c
                  ? 'bg-[#452B86] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredProducts.map(p => (
          <div
            key={p.id}
            className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs hover:border-purple-200 transition-all flex flex-col justify-between"
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-bold">
                <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700">
                  {p.store}
                </span>
                <span className="text-slate-400 uppercase">{p.category}</span>
              </div>

              <h3 className="font-bold text-sm text-slate-900 leading-snug">{p.name}</h3>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {p.isStockItem && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/60">
                    <Boxes className="w-3 h-3 text-emerald-600" />
                    <span>Stock: {p.stockQuantity || 0} {p.unit}</span>
                  </span>
                )}

                {p.barcode && (
                  <div className="flex items-center gap-1 text-[11px] text-slate-400 font-mono">
                    <Barcode className="w-3.5 h-3.5" />
                    <span>{p.barcode}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100">
              <div>
                <span className="text-[10px] text-slate-400 block font-semibold">Price</span>
                <span className="text-base font-black text-slate-900">
                  ₱{p.price.toFixed(2)}
                  <span className="text-xs font-normal text-slate-500">/{p.unit}</span>
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleOpenEdit(p)}
                  className="p-1.5 text-slate-500 hover:text-purple-700 hover:bg-purple-50 rounded-lg"
                  title="Edit Product"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(p)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                  title="Delete Product"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add / Edit Product Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-5 border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-bold text-slate-900">
              {editingProduct ? 'Edit Catalog Product' : 'Add New Catalog Product'}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Product Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Purefoods Corned Beef 210g"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Store</label>
                  <select
                    value={store}
                    onChange={e => setStore(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
                  >
                    {(stores || []).map(s => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                  <input
                    type="text"
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    placeholder="e.g. Groceries, Bakery"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
                  />
                </div>
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Unit</label>
                  <input
                    type="text"
                    value={unit}
                    onChange={e => setUnit(e.target.value)}
                    placeholder="pc, pack, kg, box"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Inventory Tracking Toggle */}
              <div className="p-3 bg-purple-50/50 border border-purple-100 rounded-xl space-y-3">
                <label className="flex items-center gap-2 text-xs font-bold text-purple-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isStockItem}
                    onChange={e => setIsStockItem(e.target.checked)}
                    className="rounded text-purple-700"
                  />
                  <span>Track In-Stock Inventory (STOCK Item)</span>
                </label>

                {isStockItem && (
                  <div className="grid grid-cols-3 gap-2.5 pt-1">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                        On-Hand Qty
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={stockQuantity}
                        onChange={e => setStockQuantity(e.target.value)}
                        className="w-full px-2 py-1 text-xs font-bold bg-white border border-purple-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                        Cost Price (₱)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={costPrice}
                        onChange={e => setCostPrice(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-2 py-1 text-xs font-semibold bg-white border border-purple-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                        Min Alert
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={minStockLevel}
                        onChange={e => setMinStockLevel(e.target.value)}
                        className="w-full px-2 py-1 text-xs font-semibold bg-white border border-purple-200 rounded-lg"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Barcode (Optional)
                </label>
                <input
                  type="text"
                  value={barcode}
                  onChange={e => setBarcode(e.target.value)}
                  placeholder="e.g. 4800016644862"
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
                />
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
                className="flex-1 py-2 text-xs font-bold text-white bg-[#452B86] rounded-xl hover:bg-[#5B43E8] shadow-xs"
              >
                {editingProduct ? 'Save Changes' : 'Create Product'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
