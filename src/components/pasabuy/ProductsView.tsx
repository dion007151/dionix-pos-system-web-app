import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, adjustStock } from '../../db/db';
import {
  Tag,
  Search,
  Plus,
  Edit2,
  Trash2,
  Barcode,
  Boxes,
  ShoppingCart,
  LayoutGrid,
  Image as ImageIcon,
  Utensils,
  Croissant,
  Pill,
  Milk,
  CakeSlice,
  ShoppingBasket,
  Upload,
  RefreshCw,
  Check,
  X,
  LoaderCircle
} from 'lucide-react';
import { Product, ProductFeeType } from '../../types';
import { lookupProductImageByBarcode, lookupProductImageByName, ProductImageSuggestion, resizeProductImage } from '../../services/productImages';

const productArtwork = (product: Product) => {
  const label = `${product.name} ${product.category} ${product.store}`.toLocaleLowerCase();
  if (/medicine|drug|tablet|capsule|biogesic|pharmacy/.test(label)) return { Icon: Pill, tone: 'from-sky-50 to-indigo-50 text-indigo-500' };
  if (/cake|red ribbon/.test(label)) return { Icon: CakeSlice, tone: 'from-rose-50 to-pink-100 text-pink-500' };
  if (/bread|bakery/.test(label)) return { Icon: Croissant, tone: 'from-amber-50 to-orange-100 text-orange-500' };
  if (/milk|dairy/.test(label)) return { Icon: Milk, tone: 'from-blue-50 to-cyan-100 text-blue-500' };
  if (/jollibee|mang inasal|chowking|fastfood|fast food|meal|chicken|chaofan|spaghetti/.test(label)) return { Icon: Utensils, tone: 'from-pink-50 to-rose-100 text-pink-600' };
  return { Icon: ShoppingBasket, tone: 'from-emerald-50 to-lime-100 text-emerald-600' };
};

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
  const [imageUrl, setImageUrl] = useState('');
  const [imageSource, setImageSource] = useState<Product['imageSource']>();
  const [imageSuggestion, setImageSuggestion] = useState<ProductImageSuggestion | null>(null);
  const [imageLookupState, setImageLookupState] = useState<'idle' | 'loading' | 'not-found' | 'error'>('idle');
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [imageRetry, setImageRetry] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const skipImageSuggestion = useRef(false);

  // Inventory fields
  const [isStockItem, setIsStockItem] = useState<boolean>(false);
  const [stockQuantity, setStockQuantity] = useState<string>('0');
  const [minStockLevel, setMinStockLevel] = useState<string>('5');

  const products = useLiveQuery(() => db.products.toArray(), []);
  const stores = useLiveQuery(() => db.stores.toArray(), []);

  useEffect(() => {
    if (!showModal || imageUrl || skipImageSuggestion.current) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const cleanName = name.trim().toLocaleLowerCase();
      const cleanBarcode = barcode.trim().replace(/\s/g, '');
      if (!cleanName && !cleanBarcode) {
        setImageSuggestion(null);
        setImageLookupState('idle');
        return;
      }

      const savedMatch = (products || []).find(product => product.imageUrl && (
        (cleanBarcode && product.barcode?.replace(/\s/g, '') === cleanBarcode) ||
        (cleanName.length >= 3 && product.name.trim().toLocaleLowerCase() === cleanName)
      ));
      if (savedMatch?.imageUrl) {
        setImageSuggestion({
          imageUrl: savedMatch.imageUrl,
          productName: savedMatch.name,
          source: 'catalog'
        });
        setImageLookupState('idle');
        setImageLoadFailed(false);
        return;
      }

      if (!/^\d{8,14}$/.test(cleanBarcode) && cleanName.length < 4) {
        setImageSuggestion(null);
        setImageLookupState('idle');
        return;
      }

      setImageLookupState('loading');
      try {
        const suggestion = /^\d{8,14}$/.test(cleanBarcode)
          ? await lookupProductImageByBarcode(cleanBarcode, imageRetry > 0, name.trim(), store)
            || (cleanName.length >= 4 ? await lookupProductImageByName(name.trim(), imageRetry > 0, store) : null)
          : await lookupProductImageByName(name.trim(), imageRetry > 0, store);
        if (cancelled) return;
        setImageSuggestion(suggestion);
        setImageLoadFailed(false);
        setImageLookupState(suggestion ? 'idle' : 'not-found');
      } catch {
        if (!cancelled) {
          setImageSuggestion(null);
          setImageLookupState('error');
        }
      }
    }, 1100);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [showModal, name, barcode, store, products, imageUrl, imageRetry]);

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
    setImageUrl('');
    setImageSource(undefined);
    setImageSuggestion(null);
    setImageLookupState('idle');
    setImageLoadFailed(false);
    setImageRetry(0);
    skipImageSuggestion.current = false;
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
    setImageUrl(p.imageUrl || '');
    setImageSource(p.imageSource);
    setImageSuggestion(null);
    setImageLookupState('idle');
    setImageLoadFailed(false);
    setImageRetry(0);
    skipImageSuggestion.current = false;
    setShowModal(true);
  };

  const clearAutomaticImage = () => {
    setImageUrl('');
    setImageSource(undefined);
    setImageSuggestion(null);
    setImageLookupState('idle');
    setImageLoadFailed(false);
    setImageRetry(0);
    skipImageSuggestion.current = true;
  };

  const handleImageUpload = async (file?: File) => {
    if (!file) return;
    try {
      const resizedImage = await resizeProductImage(file);
      setImageUrl(resizedImage);
      setImageSource('upload');
      setImageSuggestion(null);
      setImageLoadFailed(false);
      setImageLookupState('idle');
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Could not use this image.', 'error');
    }
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

    try {
      if (editingProduct) {
        if (numStock !== (editingProduct.stockQuantity || 0)) {
          await adjustStock(editingProduct.id, numStock, 'Stock quantity changed in product editor');
        }
        await db.products.update(editingProduct.id, {
          name: name.trim(),
          category,
          store,
          price: numPrice,
          costPrice: numCost,
          unit,
          barcode: barcode.trim() || undefined,
          imageUrl: imageUrl || undefined,
          imageSource: imageUrl ? imageSource : undefined,
          feeType,
          isStockItem,
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
          imageUrl: imageUrl || undefined,
          imageSource: imageUrl ? imageSource : undefined,
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
    } catch {
      addToast('Could not save the product. Check the image size and browser storage, then try again.', 'error');
    }
  };

  const handleDelete = async (p: Product) => {
    if (!confirm(`Are you sure you want to delete ${p.name}?`)) return;
    await db.products.delete(p.id);
    addToast(`Deleted "${p.name}"`, 'info');
  };

  return (
    <div className="products-catalog space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="products-heading relative flex flex-col justify-between gap-2.5 overflow-hidden rounded-[18px] px-3 py-3 sm:flex-row sm:items-center sm:px-4 sm:py-3.5">
        <div className="relative z-10 flex items-center gap-3">
          <span className="products-heading-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-pink-200 text-pink-600 shadow-sm">
            <Tag className="h-5 w-5" />
          </span>
          <div>
          <h2 className="text-base font-extrabold tracking-tight text-slate-900 sm:text-lg">
            Products & Supermarket Catalog
          </h2>
          <p className="mt-0.5 text-[11px] text-slate-600 sm:text-xs">
            Pre-defined prices, stores, barcodes, and on-hand inventory settings in Antique.
          </p>
          </div>
        </div>

        <ShoppingCart className="products-heading-art pointer-events-none absolute right-[24%] top-1/2 h-16 w-16 -translate-y-1/2 text-pink-300/50" aria-hidden="true" />

        <button
          onClick={handleOpenAdd}
          className="relative z-10 flex min-h-9 items-center gap-1.5 self-start rounded-full bg-gradient-to-r from-[#ed1680] to-[#c90052] px-4 text-xs font-bold text-white shadow-md transition-all hover:shadow-lg active:scale-95 sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>Add New Product</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="products-filter-bar flex flex-col gap-2 rounded-[16px] border border-pink-100 p-2 shadow-sm xl:flex-row xl:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by product name, barcode, or store..."
            className="h-9 w-full rounded-full border border-pink-200 bg-white pl-9 pr-3 text-xs shadow-sm placeholder:text-slate-500 focus:border-pink-400 focus:outline-none focus:ring-2 focus:ring-pink-100"
          />
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-[11px] no-scrollbar xl:justify-end">
          <button
            onClick={() => setSelectedCategory('ALL')}
            className={`inline-flex min-h-8 items-center gap-1 rounded-full border px-3 font-bold whitespace-nowrap transition-all ${
              selectedCategory === 'ALL'
                ? 'border-[#d80b65] bg-gradient-to-r from-[#ed1680] to-[#c90052] text-white shadow-sm'
                : 'border-pink-200 bg-white/80 text-slate-700 hover:bg-pink-50'
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            All Categories
          </button>
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setSelectedCategory(c)}
              className={`min-h-8 rounded-full border px-3 font-semibold whitespace-nowrap transition-all ${
                selectedCategory === c
                  ? 'border-[#d80b65] bg-gradient-to-r from-[#ed1680] to-[#c90052] text-white shadow-sm'
                  : 'border-pink-200 bg-white/80 text-slate-700 hover:bg-pink-50'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 xl:gap-2">
        {filteredProducts.map(p => (
          <div
            key={p.id}
            className="products-item-card relative flex min-h-[118px] flex-col justify-between overflow-hidden rounded-xl border border-pink-200 bg-white p-2 shadow-sm transition-all hover:-translate-y-0.5 hover:border-pink-300 hover:shadow-md sm:p-2.5"
          >
            <div className="products-card-image relative mb-1.5 flex h-14 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-pink-50 to-rose-100 sm:h-16">
              {(() => { const { Icon, tone } = productArtwork(p); return <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${tone}`} aria-label={`Illustration for ${p.name}`}><Icon className="h-7 w-7 opacity-80 sm:h-8 sm:w-8" strokeWidth={1.5} /></div>; })()}
              {p.imageUrl && <img src={p.imageUrl} alt={p.name} loading="lazy" className="absolute inset-0 h-full w-full bg-white object-contain p-2" onError={event => { event.currentTarget.style.display = 'none'; }} />}
            </div>
            {p.imageSource === 'open-food-facts' && <p className="-mt-2 mb-2 text-[9px] text-slate-500">Photo: <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer" className="underline">Open Food Facts</a> · CC BY-SA</p>}
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-1.5 text-[9px] font-bold">
                <span className="rounded-full bg-pink-100 px-2 py-0.5 text-[9px] text-pink-700">
                  {p.store}
                </span>
                <span className="truncate text-[9px] font-medium uppercase tracking-wide text-slate-500">{p.category}</span>
              </div>

              <h3 className="mt-1 line-clamp-2 text-[11px] font-bold leading-snug text-[#111839] sm:text-xs">{p.name}</h3>

              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {p.isStockItem && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700 sm:text-[10px]">
                    <Boxes className="h-3 w-3 text-emerald-600" />
                    <span>Stock: {p.stockQuantity || 0} {p.unit}</span>
                  </span>
                )}

                {p.isStockItem && (p.stockQuantity || 0) <= (p.minStockLevel || 5) && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-800">Low</span>
                )}

                {p.barcode && (
                  <div className="flex min-w-0 items-center gap-1 text-[10px] text-slate-500 font-mono">
                    <Barcode className="h-3 w-3" />
                    <span>{p.barcode}</span>
                  </div>
                )}
              </div>
            </div>

              <div className="mt-1.5 flex items-center justify-between border-t border-slate-100 pt-1.5">
              <div>
                <span className="block text-[10px] font-semibold text-slate-500">Price</span>
                  <span className="text-sm font-extrabold text-[#e20d70] sm:text-base">
                  ₱{p.price.toFixed(2)}
                  <span className="text-xs font-normal text-slate-500">/{p.unit}</span>
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleOpenEdit(p)}
                  className="rounded-full border border-pink-200 bg-pink-50 p-1.5 text-pink-600 transition-colors hover:bg-pink-100"
                  title="Edit Product"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(p)}
                  className="rounded-full border border-pink-200 bg-pink-50 p-1.5 text-pink-600 transition-colors hover:bg-rose-100 hover:text-rose-700"
                  title="Delete Product"
                >
                  <Trash2 className="h-3.5 w-3.5" />
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

            <section className="space-y-2 rounded-2xl border border-pink-100 bg-pink-50/40 p-3" aria-label="Product image">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold text-slate-800">Product image</h4>
                  <p className="text-[10px] text-slate-500">Review the suggestion or add your own photo.</p>
                </div>
                {imageLookupState === 'loading' && <LoaderCircle className="h-4 w-4 animate-spin text-pink-600" />}
              </div>

              <div className="relative flex h-36 items-center justify-center overflow-hidden rounded-xl border border-pink-100 bg-white sm:h-40">
                <div className="flex flex-col items-center gap-1 text-slate-400">
                  <ImageIcon className="h-8 w-8" />
                  <span className="text-[10px]">No image selected</span>
                </div>
                {(imageUrl || imageSuggestion?.imageUrl) && !imageLoadFailed && <img key={imageUrl || imageSuggestion?.imageUrl} src={imageUrl || imageSuggestion?.imageUrl} alt={name || 'Product image preview'} className="absolute inset-0 h-full w-full bg-white object-contain p-2" onError={() => setImageLoadFailed(true)} />}
                {(imageUrl || imageSuggestion?.imageUrl) && imageLoadFailed && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-white text-slate-500">
                    <ImageIcon className="h-7 w-7 text-pink-300" />
                    <span className="text-[10px]">This image could not be displayed.</span>
                  </div>
                )}
              </div>

              {imageSuggestion && !imageUrl && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate text-[10px] text-slate-500">
                    Suggested match: {imageSuggestion.productName || 'Barcode match'}{imageSuggestion.brands ? ` · ${imageSuggestion.brands}` : ''}
                  </p>
                  <button type="button" disabled={imageLoadFailed} onClick={() => { setImageUrl(imageSuggestion.imageUrl); setImageSource(imageSuggestion.source); setImageLoadFailed(false); }} className="inline-flex items-center gap-1 rounded-lg bg-pink-600 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-50">
                    <Check className="h-3 w-3" /> Use this image
                  </button>
                </div>
              )}

              {imageLookupState === 'not-found' && !imageSuggestion && !imageUrl && <p className="text-[10px] text-slate-600">No verified product image match. Upload a product photo or continue without one.</p>}
              {imageLookupState === 'error' && <p className="text-[10px] text-amber-800">Image lookup is unavailable right now. You can upload a photo or continue without one.</p>}
              {imageLoadFailed && <p className="text-[10px] text-amber-800">The image could not be loaded. Remove it or upload another photo.</p>}
              {imageSource === 'open-food-facts' && imageUrl && <p className="text-[9px] text-slate-500">Image from <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer" className="underline">Open Food Facts</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer" className="underline">CC BY-SA</a></p>}

              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={event => { void handleImageUpload(event.target.files?.[0]); event.currentTarget.value = ''; }} />
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-pink-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-pink-700 hover:bg-pink-50">
                  <Upload className="h-3.5 w-3.5" /> {imageUrl ? 'Replace image' : 'Upload image'}
                </button>
                {(name.trim().length >= 4 || /^\d{8,14}$/.test(barcode.trim().replace(/\s/g, ''))) && (
                  <button type="button" onClick={() => { setImageUrl(''); setImageSource(undefined); setImageSuggestion(null); setImageLoadFailed(false); setImageLookupState('idle'); setImageRetry(value => value + 1); }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50">
                    <RefreshCw className="h-3 w-3" /> Retry lookup
                  </button>
                )}
                {(imageUrl || imageSuggestion) && (
                  <button type="button" onClick={clearAutomaticImage} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50">
                    <X className="h-3 w-3" /> Remove image
                  </button>
                )}
              </div>
            </section>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Product Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => { skipImageSuggestion.current = false; setName(e.target.value); setImageRetry(0); setImageSuggestion(null); if (!imageUrl) setImageLookupState('idle'); }}
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
              <div className="p-3 bg-pink-50/50 border border-pink-100 rounded-xl space-y-3">
                <label className="flex items-center gap-2 text-xs font-bold text-pink-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isStockItem}
                    onChange={e => setIsStockItem(e.target.checked)}
                    className="rounded text-pink-700"
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
                        className="w-full px-2 py-1 text-xs font-bold bg-white border border-pink-200 rounded-lg"
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
                        className="w-full px-2 py-1 text-xs font-semibold bg-white border border-pink-200 rounded-lg"
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
                        className="w-full px-2 py-1 text-xs font-semibold bg-white border border-pink-200 rounded-lg"
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
                  onChange={e => { skipImageSuggestion.current = false; setBarcode(e.target.value); setImageRetry(0); setImageSuggestion(null); if (!imageUrl) setImageLookupState('idle'); }}
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
                className="flex-1 py-2 text-xs font-bold text-white bg-[#C90052] rounded-xl hover:bg-[#E60063] shadow-xs"
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
