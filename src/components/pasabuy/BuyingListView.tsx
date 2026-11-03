import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../context/AppContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, recordSaleFromStock } from '../../db/db';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Search,
  Filter,
  DollarSign,
  ShoppingCart,
  Store as StoreIcon,
  Check,
  RotateCcw,
  Ban,
  Boxes,
  Printer,
  CalendarClock,
  PackageSearch,
  ClipboardList,
  X,
  Settings2,
  Download,
  Save,
  Trash2,
  RotateCcw as ResetIcon
} from 'lucide-react';
import { Order, OrderItem, ItemStatus, Product, AvailabilityHistoryEntry } from '../../types';
import { syncPurchasingStatus } from '../../services/purchasingSync';
import { archiveOrder } from '../../services/orderDeletion';
import { ArchiveOrderDialog } from './ArchiveOrderDialog';
import {
  calculateOrderSummary,
  deriveOrderStatus,
  roundMoney
} from '../../services/calc';
import { SHOPPER_LOGO_DATA_URL } from '../../assets/shopperLogo';

type PrintHeaderKey = 'businessName' | 'logo' | 'address' | 'contact' | 'title' | 'orderNumber' | 'datePrepared' | 'preparedBy' | 'supplier' | 'expectedDelivery';
type PrintColumnKey = 'itemNumber' | 'barcode' | 'productName' | 'brand' | 'category' | 'description' | 'quantity' | 'unit' | 'unitCost' | 'totalCost' | 'supplier' | 'status' | 'remarks';
type PrintSummaryKey = 'itemCount' | 'quantity' | 'estimatedCost' | 'unavailableCount' | 'reorderCount' | 'cancelledCount' | 'grandTotal';

interface BuyingPrintSettings {
  header: Record<PrintHeaderKey, boolean>;
  columns: Record<PrintColumnKey, boolean>;
  summary: Record<PrintSummaryKey, boolean>;
  paperSize: 'A4' | 'Letter' | 'Legal' | 'Thermal';
  orientation: 'Portrait' | 'Landscape';
  fontSize: 'Small' | 'Medium' | 'Large';
  layout: 'Compact' | 'Detailed';
  showBorders: boolean;
  alternateRows: boolean;
  showCompanyHeader: boolean;
  includeSignatures: boolean;
  signatureLines: { preparedBy: boolean; checkedBy: boolean; approvedBy: boolean };
  customNotes: string;
  itemFilter: 'ALL' | 'ACTIVE' | 'REORDER' | 'UNAVAILABLE' | 'CANCELLED' | 'SELECTED';
  selectedItemIds: string[];
}

const PRINT_HEADER_OPTIONS: Array<[PrintHeaderKey, string]> = [
  ['businessName', 'Business / Store Name'], ['logo', 'Business Logo'], ['address', 'Store Address'], ['contact', 'Contact Number'],
  ['title', 'Buying List Title'], ['orderNumber', 'Purchase Order Number'], ['datePrepared', 'Date Prepared'], ['preparedBy', 'Prepared By'],
  ['supplier', 'Supplier Name'], ['expectedDelivery', 'Expected Delivery Date']
];
const PRINT_COLUMN_OPTIONS: Array<[PrintColumnKey, string]> = [
  ['itemNumber', 'Item Number'], ['barcode', 'Barcode / SKU'], ['productName', 'Product Name'], ['brand', 'Brand'], ['category', 'Category'],
  ['description', 'Description'], ['quantity', 'Quantity to Buy'], ['unit', 'Unit of Measurement'], ['unitCost', 'Unit Cost'],
  ['totalCost', 'Total Cost'], ['supplier', 'Supplier'], ['status', 'Item Status'], ['remarks', 'Remarks / Notes']
];
const PRINT_SUMMARY_OPTIONS: Array<[PrintSummaryKey, string]> = [
  ['itemCount', 'Total Number of Items'], ['quantity', 'Total Quantity'], ['estimatedCost', 'Total Estimated Cost'],
  ['unavailableCount', 'Number of Unavailable Items'], ['reorderCount', 'Number of Re-Ordered Items'],
  ['cancelledCount', 'Number of Cancelled Items'], ['grandTotal', 'Grand Total']
];
const allPrintOptions = <K extends string>(options: Array<[K, string]>) =>
  Object.fromEntries(options.map(([key]) => [key, true])) as Record<K, boolean>;
const DEFAULT_PRINT_SETTINGS: BuyingPrintSettings = {
  header: allPrintOptions(PRINT_HEADER_OPTIONS),
  columns: { ...allPrintOptions(PRINT_COLUMN_OPTIONS), barcode: false, brand: false, category: false, description: false },
  summary: allPrintOptions(PRINT_SUMMARY_OPTIONS),
  paperSize: 'A4', orientation: 'Portrait', fontSize: 'Medium', layout: 'Detailed',
  showBorders: true, alternateRows: true, showCompanyHeader: true, includeSignatures: true,
  signatureLines: { preparedBy: true, checkedBy: true, approvedBy: true },
  customNotes: '', itemFilter: 'ACTIVE', selectedItemIds: []
};

export const BuyingListView: React.FC = () => {
  const { addToast, currentUser, businessInfo } = useApp();

  const [selectedStore, setSelectedStore] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<ItemStatus | 'BOUGHT' | 'COMPLETED' | 'ALL'>('PENDING');

  // Purchase Dialog state
  const [itemToPurchase, setItemToPurchase] = useState<OrderItem | null>(null);
  const [actualPriceInput, setActualPriceInput] = useState<string>('');
  const [unavailableItem, setUnavailableItem] = useState<OrderItem | null>(null);
  const [unavailableReason, setUnavailableReason] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [expectedRestockDate, setExpectedRestockDate] = useState('');
  const notifiedRestockEvents = useRef(new Set<string>());
  const [printSettings, setPrintSettings] = useState<BuyingPrintSettings>(DEFAULT_PRINT_SETTINGS);
  const [printSettingsOpen, setPrintSettingsOpen] = useState(false);
  const [previewOnly, setPreviewOnly] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [deleteOrderTarget, setDeleteOrderTarget] = useState<Order | null>(null);
  const [cancelItemTarget, setCancelItemTarget] = useState<OrderItem | null>(null);
  const [archiving, setArchiving] = useState(false);
  const printSettingsKey = `buying_list_print_${currentUser?.id || 'default'}`;

  const stores = useLiveQuery(() => db.stores.toArray(), []);
  const orders = useLiveQuery(() => db.orders.toArray(), []);
  const orderItems = useLiveQuery(() => db.orderItems.toArray(), []);
  const products = useLiveQuery(() => db.products.toArray(), []);
  const rateTiers = useLiveQuery(() => db.rateTiers.toArray(), []);
  const businessNameSetting = useLiveQuery(() => db.settings.get('business_name'), []);

  useEffect(() => {
    const restockedItems = (orderItems || []).filter(item => {
      if ((orders || []).some(order => order.id === item.orderId && order.isArchived)) return false;
      const product = (products || []).find(candidate => item.productId ? candidate.id === item.productId : item.barcode ? candidate.barcode === item.barcode : candidate.isStockItem && candidate.name.trim().toLowerCase() === item.productName.trim().toLowerCase());
      const available = !!product && (product.stockQuantity || 0) >= item.qty;
      const followUp = item.status === 'UNAVAILABLE' || item.status === 'BACKORDER' || (item.status === 'PENDING' && !!item.expectedRestockDate);
      return available && followUp;
    });

    restockedItems.forEach(item => {
      const notificationKey = `${item.id}:${item.availabilityHistory?.length || 0}`;
      if (notifiedRestockEvents.current.has(notificationKey)) return;
      notifiedRestockEvents.current.add(notificationKey);
      void syncPurchasingStatus(item, 'AVAILABLE_AGAIN', 'System', item.unavailableReason).then(result => {
        if (result.affectedItems) addToast(`${item.productName} is available again for ${result.affectedOrders} affected order${result.affectedOrders === 1 ? '' : 's'}`, 'success');
      });
    });
  }, [orderItems, orders, products, addToast]);

  useEffect(() => {
    let isCurrentUser = true;
    void db.settings.get(printSettingsKey).then(saved => {
      if (!isCurrentUser) return;
      if (saved) {
        try {
          const parsed = JSON.parse(saved.value) as Partial<BuyingPrintSettings>;
          setPrintSettings({
            ...DEFAULT_PRINT_SETTINGS,
            ...parsed,
            header: { ...DEFAULT_PRINT_SETTINGS.header, ...parsed.header },
            columns: { ...DEFAULT_PRINT_SETTINGS.columns, ...parsed.columns },
            summary: { ...DEFAULT_PRINT_SETTINGS.summary, ...parsed.summary },
            signatureLines: { ...DEFAULT_PRINT_SETTINGS.signatureLines, ...parsed.signatureLines }
          });
        } catch {
          setPrintSettings(DEFAULT_PRINT_SETTINGS);
        }
      } else {
        setPrintSettings(DEFAULT_PRINT_SETTINGS);
      }
    });
    return () => { isCurrentUser = false; };
  }, [printSettingsKey]);

  // Filter items
  const cancelledOrderIds = new Set((orders || []).filter(o => o.status === 'CANCELLED').map(o => o.id));
  const archivedOrderIds = new Set((orders || []).filter(order => order.isArchived).map(order => order.id));
  const activeItems = (orderItems || []).filter(item => !archivedOrderIds.has(item.orderId));
  const getBuyingStatus = (item: OrderItem): ItemStatus => cancelledOrderIds.has(item.orderId) ? 'CANCELLED' : item.status;
  const ordersById = new Map((orders || []).map(order => [order.id, order]));
  const staffName = currentUser?.fullName || currentUser?.username || 'Staff';
  const makeAvailabilityEntry = (action: string, details: Omit<AvailabilityHistoryEntry, 'action' | 'at' | 'by'> = {}): AvailabilityHistoryEntry => ({
    action,
    at: new Date().toISOString(),
    by: staffName,
    ...details
  });
  const printableItems = [...activeItems].filter(item => {
    const status = getBuyingStatus(item);
    switch (printSettings.itemFilter) {
      case 'ACTIVE': return (status === 'PENDING' || status === 'BACKORDER' || status === 'ALTERNATIVE_SELECTED') && ordersById.get(item.orderId)?.status !== 'COMPLETED';
      case 'REORDER': return status === 'REORDER';
      case 'UNAVAILABLE': return status === 'UNAVAILABLE';
      case 'CANCELLED': return status === 'CANCELLED';
      case 'SELECTED': return printSettings.selectedItemIds.includes(item.id);
      default: return true;
    }
  }).sort((a, b) =>
    (ordersById.get(a.orderId)?.createdAt || '').localeCompare(ordersById.get(b.orderId)?.createdAt || '') ||
    a.orderId.localeCompare(b.orderId) || (a.storeName || '').localeCompare(b.storeName || '') || a.productName.localeCompare(b.productName)
  );
  const printableItemsByOrder = new Map<string, OrderItem[]>();
  printableItems.forEach(item => printableItemsByOrder.set(item.orderId, [...(printableItemsByOrder.get(item.orderId) || []), item]));
  const printableOrderSummaries = new Map([...printableItemsByOrder.entries()].flatMap(([orderId, items]) => {
    const order = ordersById.get(orderId);
    return order && order.status !== 'CANCELLED'
      ? [[orderId, calculateOrderSummary({ ...order, items }, rateTiers)]]
      : [];
  }));
  const printableTotals = [...printableOrderSummaries.values()].reduce((totals, summary) => ({
    groceries: totals.groceries + summary.subtotal,
    fees: totals.fees + summary.fee,
    total: totals.total + summary.grandTotal,
  }), { groceries: 0, fees: 0, total: 0 });
  const printableQuantity = printableItems.reduce((total, item) => total + item.qty, 0);
  const printableEstimatedCost = printableItems.reduce((total, item) =>
    total + item.qty * (item.selectedAlternativePrice ?? item.estimatedPrice ?? 0), 0);

  const printBusinessName = businessNameSetting?.value || 'DIONIX POS';
  const printOrderNumbers = [...new Set(printableItems.map(item => ordersById.get(item.orderId)?.orderNo).filter(Boolean))].join(', ');
  const printSuppliers = [...new Set(printableItems.map(item => item.storeName).filter(Boolean))].join(', ');
  const printDeliveryDates = [...new Set(printableItems.map(item => ordersById.get(item.orderId)?.deliveryTime).filter(Boolean))].join(', ');
  const printProductFor = (item: OrderItem) => (products || []).find(product => product.name.trim().toLowerCase() === item.productName.trim().toLowerCase());
  const printUnitCost = (item: OrderItem) => item.selectedAlternativePrice ?? item.actualPrice ?? item.estimatedPrice ?? 0;
  const printStatusLabel = (item: OrderItem) => {
    const status = getBuyingStatus(item);
    return status === 'REORDER' ? 'RE-ORDERED' : status === 'BACKORDER' ? 'BACKORDER' : status === 'ALTERNATIVE_SELECTED' ? 'ALTERNATIVE SELECTED' : status === 'UNAVAILABLE' ? 'NOT AVAILABLE' : status === 'CANCELLED' ? 'CANCELLED' : status === 'PURCHASED' ? 'BOUGHT' : status === 'BOUGHT_FROM_STOCK' ? 'BOUGHT / ON HAND' : 'ACTIVE';
  };
  const savePrintSettings = async (settings = printSettings) => {
    await db.settings.put({ key: printSettingsKey, value: JSON.stringify(settings) });
    addToast('Buying list print settings saved for this user', 'success');
  };
  const resetPrintSettings = async () => {
    setPrintSettings(DEFAULT_PRINT_SETTINGS);
    await savePrintSettings(DEFAULT_PRINT_SETTINGS);
  };
  const updatePrintOption = (section: 'header' | 'columns' | 'summary', key: string, checked: boolean) => {
    setPrintSettings(current => ({
      ...current,
      [section]: { ...current[section], [key]: checked }
    }));
  };
  const handleDownloadPdf = async () => {
    setIsExportingPdf(true);
    addToast('Generating PDF file, please wait...', 'info');

    try {
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `buying-list-${dateStr}.pdf`;

      const format = printSettings.paperSize === 'Legal' ? 'legal'
        : printSettings.paperSize === 'Letter' ? 'letter'
          : printSettings.paperSize === 'Thermal' ? [80, 297]
            : 'a4';

      const opt = {
        margin: [8, 8, 8, 8],
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          allowTaint: true,
        },
        jsPDF: {
          unit: 'mm',
          format: format,
          orientation: printSettings.orientation.toLowerCase()
        }
      };

      // Clone the hidden print element and make it temporarily visible
      const hidden = document.getElementById('printable-buying-list');
      if (!hidden) {
        addToast('Document content not ready. Please try again.', 'error');
        setIsExportingPdf(false);
        return;
      }

      const clone = hidden.cloneNode(true) as HTMLElement;
      clone.style.position = 'fixed';
      clone.style.top = '-9999px';
      clone.style.left = '-9999px';
      clone.style.display = 'block';
      clone.style.visibility = 'visible';
      clone.style.zIndex = '-1';
      clone.style.width = printSettings.orientation.toLowerCase() === 'landscape' ? '297mm' : '210mm';
      clone.style.background = '#ffffff';
      clone.style.color = '#000000';
      clone.style.padding = '12px';
      clone.style.fontFamily = 'Arial, sans-serif';
      clone.style.fontSize = '11px';
      document.body.appendChild(clone);

      // Small delay so browser renders the clone
      await new Promise(resolve => setTimeout(resolve, 300));

      const html2pdfModule = (await import('html2pdf.js')).default || (await import('html2pdf.js'));
      await html2pdfModule().set(opt).from(clone).save();

      document.body.removeChild(clone);
      addToast('Buying list PDF downloaded successfully!', 'success');
    } catch (err: any) {
      console.error('PDF export error:', err);
      addToast('PDF export failed. Opening print dialog instead...', 'info');
      window.print();
    } finally {
      setIsExportingPdf(false);
    }
  };

  const getPageWidth = () => {
    const dimensions = printSettings.paperSize === 'A4' ? [210, 297]
      : printSettings.paperSize === 'Letter' ? [216, 279]
        : printSettings.paperSize === 'Legal' ? [216, 356]
          : [80, 200];
    if (printSettings.paperSize === 'Thermal') return '80mm';
    return `${printSettings.orientation === 'Portrait' ? dimensions[0] : dimensions[1]}mm`;
  };

  const renderPrintDocument = (isPreview: boolean) => {
    const visibleColumns = PRINT_COLUMN_OPTIONS.filter(([key]) => printSettings.columns[key]);
    const pageName = `buying-list-${printSettings.paperSize.toLowerCase()}-${printSettings.orientation.toLowerCase()}`;
    const logo = <img src={SHOPPER_LOGO_DATA_URL} alt={`${printBusinessName} logo`} className="buying-print-logo" />;
    const headerValue = (key: PrintHeaderKey) => printSettings.header[key];
    const summaryValue = (key: PrintSummaryKey) => printSettings.summary[key];
    const printHeaderGroup = printSettings.showCompanyHeader && (headerValue('businessName') || headerValue('logo') || headerValue('address') || headerValue('contact'));
    const summaryValues: Record<PrintSummaryKey, string> = {
      itemCount: String(printableItems.length), quantity: String(printableQuantity),
      estimatedCost: `₱${roundMoney(printableEstimatedCost).toFixed(2)}`,
      unavailableCount: String(printableItems.filter(item => getBuyingStatus(item) === 'UNAVAILABLE').length),
      reorderCount: String(printableItems.filter(item => getBuyingStatus(item) === 'REORDER').length),
      cancelledCount: String(printableItems.filter(item => getBuyingStatus(item) === 'CANCELLED').length),
      grandTotal: `₱${roundMoney(printableTotals.total).toFixed(2)}`
    };
    return <article
      id={isPreview ? undefined : 'printable-buying-list'}
      className={`buying-print-document ${isPreview ? 'buying-print-preview' : 'buying-print-output'} ${printSettings.showBorders ? 'with-borders' : ''} ${printSettings.alternateRows ? 'alternate-rows' : ''} ${printSettings.layout.toLowerCase()} ${printSettings.fontSize.toLowerCase()} ${printSettings.paperSize === 'Thermal' ? 'thermal' : ''}`}
      style={{ width: isPreview ? getPageWidth() : undefined, maxWidth: isPreview ? '100%' : undefined, page: isPreview ? undefined : pageName } as React.CSSProperties}
    >
      {printHeaderGroup && <header className="buying-print-company-header">
        {headerValue('logo') && logo}
        <div>{headerValue('businessName') && <h1>{printBusinessName}</h1>}
          {headerValue('address') && <p>{businessInfo.address || 'San Angel, San Jose de Buenavista, Antique 5700'}</p>}
          {headerValue('contact') && <p>Contact: {businessInfo.phone || '09054853573'}</p>}
        </div>
      </header>}
      <div className="buying-print-heading">
        <div>{headerValue('title') && <h2>Buying List</h2>}
          {headerValue('orderNumber') && printOrderNumbers && <p>Purchase Order: {printOrderNumbers}</p>}
          {headerValue('supplier') && printSuppliers && <p>Supplier: {printSuppliers}</p>}
        </div>
        <div className="buying-print-meta">
          {headerValue('datePrepared') && <p>Date prepared: {new Date().toLocaleDateString('en-PH')}</p>}
          {headerValue('preparedBy') && <p>Prepared by: {currentUser?.fullName || currentUser?.username || 'Staff'}</p>}
          {headerValue('expectedDelivery') && printDeliveryDates && <p>Expected delivery: {printDeliveryDates}</p>}
        </div>
      </div>
      {printSettings.showCompanyHeader && !printHeaderGroup && headerValue('title') && <h2 className="buying-print-title">Buying List</h2>}
      {PRINT_SUMMARY_OPTIONS.some(([key]) => summaryValue(key)) && <section className="buying-print-summary">
        {PRINT_SUMMARY_OPTIONS.filter(([key]) => summaryValue(key)).map(([key, label]) => <div key={key}><span>{label}</span><strong>{summaryValues[key]}</strong></div>)}
      </section>}
      <table className="buying-print-table">
        <thead><tr>{visibleColumns.map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead>
        <tbody>{printableItems.map((item, index) => {
          const product = printProductFor(item);
          const parentOrder = ordersById.get(item.orderId);
          const unitCost = printUnitCost(item);
          const values: Record<PrintColumnKey, React.ReactNode> = {
            itemNumber: index + 1,
            barcode: item.barcode || product?.barcode || '—',
            productName: <><strong>{item.selectedAlternativeProductName || item.productName}</strong>{printSettings.layout === 'Detailed' && item.selectedAlternativeProductName && <small>Original: {item.productName}</small>}{printSettings.layout === 'Detailed' && parentOrder && <small>{parentOrder.orderNo} · {parentOrder.customerName || 'Walk-in'}</small>}</>,
            brand: '—', category: product?.category || item.category || '—',
            description: printSettings.layout === 'Detailed' ? (item.notes || '—') : '—',
            quantity: item.qty, unit: item.unit, unitCost: `₱${unitCost.toFixed(2)}`,
            totalCost: `₱${roundMoney(item.qty * unitCost).toFixed(2)}`,
            supplier: item.selectedAlternativeSupplier || item.storeName || '—',
            status: printStatusLabel(item), remarks: item.notes || '—'
          };
          const status = getBuyingStatus(item);
          return <tr key={item.id} className={`status-${status.toLowerCase().replace(/_/g, '-')} ${index % 2 === 1 ? 'alternate' : ''}`}>
            {visibleColumns.map(([key]) => <td key={key}>{values[key]}</td>)}
          </tr>;
        })}
          {printableItems.length === 0 && <tr><td colSpan={Math.max(visibleColumns.length, 1)} className="buying-print-empty">No items match the selected print filter.</td></tr>}
        </tbody>
      </table>
      {printSettings.customNotes.trim() && <footer className="buying-print-notes"><strong>Notes:</strong> {printSettings.customNotes}</footer>}
      {printSettings.includeSignatures && Object.values(printSettings.signatureLines).some(Boolean) && <section className="buying-print-signatures">
        {printSettings.signatureLines.preparedBy && <div><span>Prepared by</span><i /></div>}
        {printSettings.signatureLines.checkedBy && <div><span>Checked by</span><i /></div>}
        {printSettings.signatureLines.approvedBy && <div><span>Approved by</span><i /></div>}
      </section>}
    </article>;
  };

  const filteredItems = activeItems.filter(item => {
    const matchesStore = selectedStore === 'ALL' || item.storeName === selectedStore;
    const itemStatus = getBuyingStatus(item);
    const matchesStatus = filterStatus === 'ALL' ||
      (filterStatus === 'COMPLETED' ? ordersById.get(item.orderId)?.status === 'COMPLETED' :
        filterStatus === 'BOUGHT' ? itemStatus === 'PURCHASED' || itemStatus === 'BOUGHT_FROM_STOCK' : itemStatus === filterStatus);
    const matchesSearch =
      !searchQuery ||
      item.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.storeName && item.storeName.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesStore && matchesStatus && matchesSearch;
  });
  const visibleItemsByOrder = new Map<string, OrderItem[]>();
  filteredItems.forEach(item => visibleItemsByOrder.set(item.orderId, [...(visibleItemsByOrder.get(item.orderId) || []), item]));

  // KPI Calculations
  const pendingItems = activeItems.filter(i => getBuyingStatus(i) === 'PENDING');
  const purchasedItems = activeItems.filter(i => ['PURCHASED', 'BOUGHT_FROM_STOCK'].includes(getBuyingStatus(i)));

  const estimatedCapital = pendingItems.reduce(
    (sum, i) => sum + i.qty * (i.estimatedPrice || 0),
    0
  );

  const actualSpent = purchasedItems.reduce(
    (sum, i) => sum + i.qty * (i.actualPrice || i.estimatedPrice || 0),
    0
  );

  // Mark Item as Purchased
  const handleOpenPurchase = (item: OrderItem) => {
    setItemToPurchase(item);
    setActualPriceInput(String(item.selectedAlternativePrice ?? item.actualPrice ?? item.estimatedPrice ?? 0));
  };

  const handleConfirmPurchase = async () => {
    if (!itemToPurchase) return;
    const price = parseFloat(actualPriceInput);
    if (isNaN(price) || price < 0) {
      addToast('Please enter a valid price', 'error');
      return;
    }

    const alternativePurchase = !!itemToPurchase.selectedAlternativeProductName;
    const updatedItem: OrderItem = {
      ...itemToPurchase,
      actualPrice: price,
      status: 'PURCHASED',
      purchasedQty: itemToPurchase.qty,
      purchaseDate: new Date().toISOString(),
      availabilityHistory: alternativePurchase
        ? [...(itemToPurchase.availabilityHistory || []), makeAvailabilityEntry('Alternative purchased', {
          alternativeProductId: itemToPurchase.selectedAlternativeProductId,
          alternativeProductName: itemToPurchase.selectedAlternativeProductName,
          alternativeSupplier: itemToPurchase.selectedAlternativeSupplier,
          alternativePrice: price,
          priceDifference: price - itemToPurchase.estimatedPrice
        })]
        : itemToPurchase.availabilityHistory
    };

    await db.orderItems.put(updatedItem);

    // Check if parent order status should transition
    const siblingItems = await db.orderItems.where('orderId').equals(itemToPurchase.orderId).toArray();
    const parentOrder = await db.orders.get(itemToPurchase.orderId);
    if (parentOrder && parentOrder.status !== 'CANCELLED' && parentOrder.status !== 'COMPLETED') {
      const newStatus = deriveOrderStatus(false, false, siblingItems);
      if (newStatus !== parentOrder.status) {
        await db.orders.update(parentOrder.id, {
          status: newStatus,
          updatedAt: new Date().toISOString()
        });
      }
    }

    addToast(alternativePurchase
      ? `Purchased alternative "${itemToPurchase.selectedAlternativeProductName}" for ₱${price.toFixed(2)}; original order record retained`
      : `Purchased "${itemToPurchase.productName}" for ₱${price.toFixed(2)}`, 'success');
    setItemToPurchase(null);
  };

  // Fulfill from on-hand stock
  const handleFulfillFromStock = async (item: OrderItem) => {
    const parentOrder = (orders || []).find(o => o.id === item.orderId);
    let success = false;
    try {
      success = await recordSaleFromStock(
        item.productName,
        item.qty,
        item.orderId,
        parentOrder?.orderNo,
        item.productId,
        item.id
      );
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Unable to deduct stock for this item', 'error');
      return;
    }
    if (!success) {
      addToast('No unambiguous stocked product was found. Stock was not changed.', 'error');
      return;
    }

    const updatedItem: OrderItem = {
      ...item,
      status: 'BOUGHT_FROM_STOCK',
      actualPrice: item.estimatedPrice,
      purchasedQty: item.qty,
      purchaseDate: new Date().toISOString()
    };

    await db.orderItems.put(updatedItem);

    const siblingItems = await db.orderItems.where('orderId').equals(item.orderId).toArray();
    if (parentOrder && parentOrder.status !== 'CANCELLED' && parentOrder.status !== 'COMPLETED') {
      const derived = deriveOrderStatus(false, false, siblingItems);
      if (derived !== parentOrder.status) {
        await db.orders.update(parentOrder.id, {
          status: derived,
          updatedAt: new Date().toISOString()
        });
      }
    }

    addToast(
      success
        ? `Fulfilled "${item.productName}" from on-hand stock (-${item.qty})`
        : `Marked "${item.productName}" as fulfilled from stock`,
      'success'
    );
  };

  // Mark as Unavailable or Reorder
  const handleSetStatus = async (item: OrderItem, newStatus: ItemStatus) => {
    const action = newStatus === 'REORDER' ? 'Re-ordered' : newStatus === 'PENDING' ? 'Returned to To Buy' : `Marked ${newStatus.replace(/_/g, ' ').toLowerCase()}`;
    if (newStatus === 'REORDER') {
      const syncResult = await syncPurchasingStatus(item, 'REORDER', staffName);
      addToast(`${item.productName} re-ordered · ${syncResult.affectedOrders} affected order${syncResult.affectedOrders === 1 ? '' : 's'}`, 'info');
    } else {
      await db.orderItems.update(item.id, {
        status: newStatus,
        unavailableReason: undefined,
        unavailableAt: undefined,
        unavailableBy: undefined,
        actualPrice: item.actualPrice,
        availabilityHistory: [...(item.availabilityHistory || []), makeAvailabilityEntry(action)]
      });
    }

    if (newStatus !== 'REORDER') addToast(`Item marked as ${newStatus}`, 'info');
  };

  const openUnavailablePanel = (item: OrderItem) => {
    setUnavailableItem(item);
    setUnavailableReason(item.unavailableReason || '');
    setSupplierSearch(item.productName);
    setExpectedRestockDate(item.expectedRestockDate || '');
  };

  const handleRecordUnavailable = async () => {
    if (!unavailableItem) return;
    const now = new Date().toISOString();
    const current = await db.orderItems.get(unavailableItem.id);
    const history = current?.availabilityHistory || unavailableItem.availabilityHistory || [];
    const reason = unavailableReason.trim() || 'Supplier reported out of stock';
    const reasonChanged = current?.unavailableReason !== reason;
    const historyWithUnavailable = current?.unavailableAt
      ? reasonChanged ? [...history, makeAvailabilityEntry('Updated unavailable reason', { reason })] : history
      : [...history, makeAvailabilityEntry('Marked unavailable', { reason })];
    const syncResult = await syncPurchasingStatus(current || unavailableItem, 'UNAVAILABLE', staffName, reason);
    const refreshed = await db.orderItems.get(unavailableItem.id);
    setUnavailableItem({
      ...unavailableItem,
      status: 'UNAVAILABLE',
      unavailableReason: reason,
      unavailableAt: current?.unavailableAt || now,
      unavailableBy: current?.unavailableBy || staffName,
      availabilityHistory: refreshed?.availabilityHistory || historyWithUnavailable
    });
    addToast(`WARNING: ${unavailableItem.productName} is unavailable for purchasing. This item affects ${syncResult.affectedOrders} customer order${syncResult.affectedOrders === 1 ? '' : 's'}.`, 'info');
  };

  const handleMarkUnavailableAndOpen = async (item: OrderItem) => {
    const current = await db.orderItems.get(item.id);
    if (!current) return;
    const now = new Date().toISOString();
    const reason = current.unavailableReason || 'Supplier reported out of stock';
    const history = current.availabilityHistory || [];
    const updatedItem: OrderItem = {
      ...current,
      status: 'UNAVAILABLE',
      unavailableReason: reason,
      unavailableAt: current.unavailableAt || now,
      unavailableBy: current.unavailableBy || staffName,
      availabilityHistory: current.unavailableAt
        ? history
        : [...history, makeAvailabilityEntry('Marked unavailable', { reason })]
    };
    const syncResult = await syncPurchasingStatus(updatedItem, 'UNAVAILABLE', staffName, reason);
    const refreshed = await db.orderItems.get(item.id);
    setUnavailableItem(refreshed || updatedItem);
    setUnavailableReason(reason);
    setSupplierSearch(item.productName);
    setExpectedRestockDate(item.expectedRestockDate || '');
    addToast(`WARNING: ${item.productName} is unavailable for purchasing. This item affects ${syncResult.affectedOrders} customer order${syncResult.affectedOrders === 1 ? '' : 's'}.`, 'info');
  };

  const handleBackorder = async () => {
    if (!unavailableItem) return;
    const current = await db.orderItems.get(unavailableItem.id);
    const reason = unavailableReason.trim() || unavailableItem.unavailableReason || 'Supplier reported out of stock';
    const history = current?.availabilityHistory || unavailableItem.availabilityHistory || [];
    const unavailableEvent = current?.unavailableAt ? [] : [makeAvailabilityEntry('Marked unavailable', { reason })];
    await db.orderItems.update(unavailableItem.id, {
      status: 'BACKORDER',
      unavailableReason: current?.unavailableReason || reason,
      unavailableAt: current?.unavailableAt || new Date().toISOString(),
      unavailableBy: current?.unavailableBy || staffName,
      availabilityHistory: [...history, ...unavailableEvent, makeAvailabilityEntry('Backordered', { reason })]
    });
    addToast(`${unavailableItem.productName} added to backorder follow-up`, 'info');
    setUnavailableItem(null);
  };

  const handleWaitForRestock = async () => {
    if (!unavailableItem) return;
    const current = await db.orderItems.get(unavailableItem.id);
    const reason = unavailableReason.trim() || unavailableItem.unavailableReason || 'Supplier reported out of stock';
    const history = current?.availabilityHistory || unavailableItem.availabilityHistory || [];
    const unavailableEvent = current?.unavailableAt ? [] : [makeAvailabilityEntry('Marked unavailable', { reason })];
    await db.orderItems.update(unavailableItem.id, {
      status: 'PENDING',
      unavailableReason: current?.unavailableReason || reason,
      unavailableAt: current?.unavailableAt || new Date().toISOString(),
      unavailableBy: current?.unavailableBy || staffName,
      expectedRestockDate: expectedRestockDate || undefined,
      availabilityHistory: [...history, ...unavailableEvent, makeAvailabilityEntry('Waiting for restock', {
        reason,
        expectedRestockDate: expectedRestockDate || undefined
      })]
    });
    addToast(expectedRestockDate ? `Restock follow-up set for ${expectedRestockDate}` : 'Item returned to To Buy for restock follow-up', 'info');
    setUnavailableItem(null);
  };

  const handleSelectAlternative = async (product: Product) => {
    if (!unavailableItem) return;
    const current = await db.orderItems.get(unavailableItem.id);
    const reason = unavailableReason.trim() || unavailableItem.unavailableReason || 'Supplier reported out of stock';
    const history = current?.availabilityHistory || unavailableItem.availabilityHistory || [];
    const unavailableEvent = current?.unavailableAt ? [] : [makeAvailabilityEntry('Marked unavailable', { reason })];
    const difference = product.price - unavailableItem.estimatedPrice;
    const details = {
      alternativeProductId: product.id,
      alternativeProductName: product.name,
      alternativeSupplier: product.store,
      alternativePrice: product.price,
      priceDifference: difference
    };
    await db.orderItems.update(unavailableItem.id, {
      status: 'ALTERNATIVE_SELECTED',
      selectedAlternativeProductId: product.id,
      selectedAlternativeProductName: product.name,
      selectedAlternativeSupplier: product.store,
      selectedAlternativePrice: product.price,
      unavailableReason: current?.unavailableReason || reason,
      unavailableAt: current?.unavailableAt || new Date().toISOString(),
      unavailableBy: current?.unavailableBy || staffName,
      availabilityHistory: [...history, ...unavailableEvent, makeAvailabilityEntry('Alternative selected for review', details)]
    });
    addToast(`Alternative recorded: ${product.name} at ${product.store}. Original item was not changed.`, 'success');
    setUnavailableItem(null);
  };

  const handleCancelItem = async (item: OrderItem) => {
    await syncPurchasingStatus(item, 'CANCELLED', staffName, 'Buying staff cancelled this product from the buying list; staff review required');
    await db.orderItems.update(item.id, {
      status: 'CANCELLED',
      actualPrice: 0,
      purchasedQty: 0,
      purchaseDate: undefined,
      availabilityHistory: [...(item.availabilityHistory || []), makeAvailabilityEntry('Removed from buying list after confirmation', { requiresStaffAction: true, reason: 'Buying list item cancelled; determine customer order follow-up' })]
    });

    addToast(`"${item.productName}" cancelled`, 'info');
  };

  const handleDeleteOrder = async (order: Order) => {
    if (archiving) return;
    setArchiving(true);
    try {
      const archivedOrderNo = await archiveOrder(order.id, currentUser?.role || 'Shopper', staffName, 'Live Buying List');
      setDeleteOrderTarget(null);
      addToast(`Order ${archivedOrderNo} successfully moved to Archive.`, 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Unable to archive this order. Please try again.', 'error');
    } finally {
      setArchiving(false);
    }
  };

  const handleRemoveUnavailableItem = async () => {
    if (!unavailableItem || !confirm(`Remove "${unavailableItem.productName}" from the current buying list? The original order record will be retained.`)) return;
    const current = await db.orderItems.get(unavailableItem.id);
    if (!current) return;
    const now = new Date().toISOString();
    const reason = unavailableReason.trim() || current.unavailableReason || 'Supplier reported out of stock';
    const history = current.availabilityHistory || [];
    const unavailableEvent = current.unavailableAt ? [] : [makeAvailabilityEntry('Marked unavailable', { reason })];
    await syncPurchasingStatus(current, 'CANCELLED', staffName, 'Buying staff removed this unavailable product; affected orders need review');
    await db.orderItems.update(current.id, {
      status: 'CANCELLED',
      unavailableReason: current.unavailableReason || reason,
      unavailableAt: current.unavailableAt || now,
      unavailableBy: current.unavailableBy || staffName,
      availabilityHistory: [...history, ...unavailableEvent, makeAvailabilityEntry('Removed from buying list after confirmation', { requiresStaffAction: true, reason: 'Buying list item removed; determine customer order follow-up' })]
    });
    addToast(`"${current.productName}" removed from the buying list; order history retained`, 'info');
    setUnavailableItem(null);
  };

  const handleCompleteOrder = async (item: OrderItem) => {
    const parentOrder = await db.orders.get(item.orderId);
    if (!parentOrder || parentOrder.status === 'CANCELLED') return;

    await db.orders.update(parentOrder.id, {
      status: 'COMPLETED',
      updatedAt: new Date().toISOString()
    });
    addToast(`Order ${parentOrder.orderNo} marked as complete`, 'success');
  };

  const alternativeProducts = unavailableItem
    ? (products || []).filter(product => {
      const query = supplierSearch.trim().toLowerCase();
      const isSameSupplierListing = product.name.trim().toLowerCase() === unavailableItem.productName.trim().toLowerCase() && product.store.trim().toLowerCase() === (unavailableItem.storeName || '').trim().toLowerCase();
      const isDifferentSupplier = product.store.trim().toLowerCase() !== (unavailableItem.storeName || '').trim().toLowerCase();
      return !isSameSupplierListing && isDifferentSupplier && !!query && `${product.name} ${product.category} ${product.store}`.toLowerCase().includes(query);
    })
    : [];
  const recommendedAlternative = [...alternativeProducts].sort((a, b) => a.price - b.price)[0];

  return (
    <div className="space-y-5">
      {deleteOrderTarget && <ArchiveOrderDialog order={deleteOrderTarget} items={(orderItems || []).filter(item => item.orderId === deleteOrderTarget.id)} busy={archiving} onCancel={() => setDeleteOrderTarget(null)} onConfirm={() => void handleDeleteOrder(deleteOrderTarget)} />}
      {cancelItemTarget && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setCancelItemTarget(null); }}><section role="alertdialog" aria-modal="true" aria-labelledby="cancel-buying-item-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><h3 id="cancel-buying-item-title" className="text-sm font-extrabold text-slate-900">Cancel item?</h3><p className="mt-2 text-xs text-slate-600">Cancel <strong>{cancelItemTarget.productName}</strong> from the buying list? Its order history will remain available.</p><div className="mt-5 flex justify-end gap-2"><button onClick={() => setCancelItemTarget(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600">Keep item</button><button onClick={() => { const item = cancelItemTarget; setCancelItemTarget(null); void handleCancelItem(item); }} className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white">Confirm cancel</button></div></section></div>}
      {/* Top Header & Shopping Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-pink-700" />
            <span>Shopper Buying List</span>
          </h2>
          <p className="text-xs text-slate-500">
            Check off items live while in the supermarket or mall in Antique.
          </p>
        </div>

        {/* Quick Summary and Print All */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-3 bg-white border border-slate-200/80 px-3 py-2 rounded-2xl shadow-xs text-xs">
            <div>
              <span className="text-[10px] text-slate-400 block font-semibold uppercase">Pending</span>
              <span className="font-bold text-amber-600">{pendingItems.length} items</span>
            </div>
            <div className="w-px h-6 bg-slate-200" />
            <div>
              <span className="text-[10px] text-slate-400 block font-semibold uppercase">Est. Capital</span>
              <span className="font-bold text-slate-900">₱{roundMoney(estimatedCapital).toFixed(2)}</span>
            </div>
            <div className="w-px h-6 bg-slate-200" />
            <div>
              <span className="text-[10px] text-slate-400 block font-semibold uppercase">Actual Spent</span>
              <span className="font-bold text-emerald-700">₱{roundMoney(actualSpent).toFixed(2)}</span>
            </div>
          </div>
          <button type="button" onClick={() => { setPrintSettingsOpen(true); setPreviewOnly(false); }} className="flex items-center justify-center gap-2 rounded-xl bg-[#C90052] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#E60063]">
            <Printer className="h-4 w-4" /> Print Buying List
          </button>
        </div>
      </div>

      {createPortal(renderPrintDocument(false), document.body)}

      {printSettingsOpen && createPortal(
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-3" onClick={() => setPrintSettingsOpen(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="buying-print-settings-title" className="flex max-h-[96vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-t-3xl bg-slate-100 shadow-2xl sm:rounded-3xl" onClick={event => event.stopPropagation()}>
            <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
              <div><h2 id="buying-print-settings-title" className="flex items-center gap-2 text-base font-black text-slate-900"><Settings2 className="h-4 w-4 text-[#C90052]" />Customize Buying List Printout</h2><p className="mt-0.5 text-[11px] text-slate-500">Changes update the preview immediately. Settings are saved separately for each user.</p></div>
              <button type="button" onClick={() => setPrintSettingsOpen(false)} aria-label="Close print settings" className="rounded-xl bg-slate-100 p-2 text-slate-600 hover:bg-slate-200"><X className="h-4 w-4" /></button>
            </header>

            <div className={`min-h-0 flex-1 overflow-y-auto p-3 sm:p-5 ${previewOnly ? '' : 'grid gap-4 lg:grid-cols-[minmax(340px,0.9fr)_minmax(0,1.1fr)]'}`}>
              {!previewOnly && <div className="space-y-3">
                <fieldset className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
                  <legend className="px-1 text-xs font-black text-slate-900">Items to print</legend>
                  <label className="mb-2 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Filter</label>
                  <select value={printSettings.itemFilter} onChange={event => setPrintSettings(current => ({ ...current, itemFilter: event.target.value as BuyingPrintSettings['itemFilter'] }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                    <option value="ALL">All Items</option><option value="ACTIVE">Active / To Buy Items Only</option><option value="REORDER">Re-Ordered Items Only</option><option value="UNAVAILABLE">Unavailable Items Only</option><option value="CANCELLED">Cancelled Items Only</option><option value="SELECTED">Selected Items Only</option>
                  </select>
                  {printSettings.itemFilter === 'SELECTED' && <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-xl bg-slate-50 p-2">
                    {activeItems.length === 0 ? <p className="p-2 text-xs text-slate-500">There are no buying list items to select.</p> : activeItems.map(item => <label key={item.id} className="flex cursor-pointer items-start gap-2 rounded-lg p-1.5 text-[11px] hover:bg-white">
                      <input type="checkbox" checked={printSettings.selectedItemIds.includes(item.id)} onChange={event => setPrintSettings(current => ({ ...current, selectedItemIds: event.target.checked ? [...new Set([...current.selectedItemIds, item.id])] : current.selectedItemIds.filter(id => id !== item.id) }))} />
                      <span><strong>{item.productName}</strong> · {item.qty} {item.unit} · {getBuyingStatus(item).replace(/_/g, ' ')}</span>
                    </label>)}
                  </div>}
                </fieldset>

                <fieldset className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
                  <legend className="px-1 text-xs font-black text-slate-900">Header information</legend>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                    {PRINT_HEADER_OPTIONS.map(([key, label]) => <label key={key} className="flex items-center gap-2 text-[11px] text-slate-700"><input type="checkbox" checked={printSettings.header[key]} onChange={event => updatePrintOption('header', key, event.target.checked)} />{label}</label>)}
                  </div>
                </fieldset>

                <fieldset className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
                  <legend className="px-1 text-xs font-black text-slate-900">Product columns</legend>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
                    {PRINT_COLUMN_OPTIONS.map(([key, label]) => <label key={key} className="flex items-center gap-2 text-[11px] text-slate-700"><input type="checkbox" checked={printSettings.columns[key]} onChange={event => updatePrintOption('columns', key, event.target.checked)} />{label}</label>)}
                  </div>
                </fieldset>

                <fieldset className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
                  <legend className="px-1 text-xs font-black text-slate-900">Summary information</legend>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
                    {PRINT_SUMMARY_OPTIONS.map(([key, label]) => <label key={key} className="flex items-center gap-2 text-[11px] text-slate-700"><input type="checkbox" checked={printSettings.summary[key]} onChange={event => updatePrintOption('summary', key, event.target.checked)} />{label}</label>)}
                  </div>
                </fieldset>

                <fieldset className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
                  <legend className="px-1 text-xs font-black text-slate-900">Page and style</legend>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[10px] font-bold text-slate-600">Paper size<select value={printSettings.paperSize} onChange={event => setPrintSettings(current => ({ ...current, paperSize: event.target.value as BuyingPrintSettings['paperSize'] }))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs"><option>A4</option><option>Letter</option><option>Legal</option><option>Thermal</option></select></label>
                    <label className="text-[10px] font-bold text-slate-600">Orientation<select value={printSettings.orientation} onChange={event => setPrintSettings(current => ({ ...current, orientation: event.target.value as BuyingPrintSettings['orientation'] }))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs"><option>Portrait</option><option>Landscape</option></select></label>
                    <label className="text-[10px] font-bold text-slate-600">Font size<select value={printSettings.fontSize} onChange={event => setPrintSettings(current => ({ ...current, fontSize: event.target.value as BuyingPrintSettings['fontSize'] }))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs"><option>Small</option><option>Medium</option><option>Large</option></select></label>
                    <label className="text-[10px] font-bold text-slate-600">Print layout<select value={printSettings.layout} onChange={event => setPrintSettings(current => ({ ...current, layout: event.target.value as BuyingPrintSettings['layout'] }))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs"><option>Compact</option><option>Detailed</option></select></label>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {([['showBorders', 'Show table borders'], ['alternateRows', 'Alternate row colors'], ['showCompanyHeader', 'Show company header'], ['includeSignatures', 'Include signature section']] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-[11px] text-slate-700"><input type="checkbox" checked={printSettings[key]} onChange={event => setPrintSettings(current => ({ ...current, [key]: event.target.checked }))} />{label}</label>)}
                  </div>
                  {printSettings.includeSignatures && <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-100 pt-3">
                    {([['preparedBy', 'Prepared by'], ['checkedBy', 'Checked by'], ['approvedBy', 'Approved by']] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-[11px] text-slate-700"><input type="checkbox" checked={printSettings.signatureLines[key]} onChange={event => setPrintSettings(current => ({ ...current, signatureLines: { ...current.signatureLines, [key]: event.target.checked } }))} />{label} signature</label>)}
                  </div>}
                  <label className="mt-3 block text-[10px] font-bold text-slate-600">Custom notes or instructions<textarea value={printSettings.customNotes} onChange={event => setPrintSettings(current => ({ ...current, customNotes: event.target.value }))} rows={2} placeholder="Optional note to print at the bottom" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-normal" /></label>
                </fieldset>
              </div>}

              <div className={`min-w-0 overflow-auto rounded-2xl bg-slate-300 p-3 sm:p-5 ${previewOnly ? 'flex justify-center' : ''}`}>
                <div className="buying-preview-scale">{renderPrintDocument(true)}</div>
              </div>
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-3 py-3 sm:px-5">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => { setPreviewOnly(value => !value); }} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50"><Printer className="h-3.5 w-3.5" />{previewOnly ? 'Edit Settings' : 'Preview'}</button>
                <button type="button" onClick={() => void savePrintSettings()} className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100"><Save className="h-3.5 w-3.5" />Save Print Settings</button>
                <button type="button" onClick={() => void resetPrintSettings()} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50"><ResetIcon className="h-3.5 w-3.5" />Reset to Default</button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setPrintSettingsOpen(false)} className="rounded-lg bg-slate-100 px-3 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-200">Cancel</button>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={isExportingPdf}
                  className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-bold text-blue-800 hover:bg-blue-100 disabled:opacity-60 transition-all"
                >
                  <Download className={`h-3.5 w-3.5 ${isExportingPdf ? 'animate-bounce' : ''}`} />
                  <span>{isExportingPdf ? 'Generating PDF...' : 'Download PDF'}</span>
                </button>
                <button type="button" onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg bg-[#C90052] px-4 py-2 text-[11px] font-bold text-white hover:bg-[#E60063]"><Printer className="h-3.5 w-3.5" />Print</button>
              </div>
            </footer>
          </section>
        </div>, document.body
      )}

      {/* Filter Bar (Horizontal Store Badges + Search) */}
      <div className="bg-white p-3.5 border border-slate-200/80 rounded-2xl shadow-xs space-y-3">
        {/* Search & Status Filters */}
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search product name or store..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-slate-100 p-0.5 text-xs font-semibold no-scrollbar">
            {([
              { id: 'PENDING', label: 'To Buy', count: pendingItems.length },
              { id: 'BOUGHT', label: 'Bought', count: purchasedItems.length },
              { id: 'REORDER', label: 'Re-order', count: activeItems.filter(i => getBuyingStatus(i) === 'REORDER').length },
              { id: 'UNAVAILABLE', label: 'Not Available', count: activeItems.filter(i => getBuyingStatus(i) === 'UNAVAILABLE').length },
              { id: 'BACKORDER', label: 'Backorder', count: activeItems.filter(i => getBuyingStatus(i) === 'BACKORDER').length },
              { id: 'ALTERNATIVE_SELECTED', label: 'Alternative', count: activeItems.filter(i => getBuyingStatus(i) === 'ALTERNATIVE_SELECTED').length },
              { id: 'CANCELLED', label: 'Cancelled', count: activeItems.filter(i => getBuyingStatus(i) === 'CANCELLED').length },
              { id: 'COMPLETED', label: 'Completed', count: activeItems.filter(i => ordersById.get(i.orderId)?.status === 'COMPLETED').length },
              { id: 'ALL', label: 'All', count: activeItems.length },
            ] as const).map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilterStatus(tab.id)}
                className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1 transition-all ${filterStatus === tab.id ? 'bg-[#C90052] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
        </div>

        {/* Store Quick Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 no-scrollbar text-xs">
          <button
            onClick={() => setSelectedStore('ALL')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${selectedStore === 'ALL'
              ? 'bg-[#C90052] text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
          >
            <span>All Stores</span>
          </button>
          {(stores || []).map(s => {
            const count = activeItems.filter(i => i.storeName === s.name && getBuyingStatus(i) === 'PENDING').length;
            const isSelected = selectedStore === s.name;
            return (
              <button
                key={s.id}
                onClick={() => setSelectedStore(s.name)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-all ${isSelected
                  ? 'bg-[#C90052] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
              >
                <StoreIcon className="w-3.5 h-3.5" />
                <span>{s.name}</span>
                {count > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${isSelected ? 'bg-white text-pink-900' : 'bg-amber-200 text-amber-900'
                      }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Spreadsheet-style Buying List */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        {filteredItems.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle className="mx-auto mb-2 h-10 w-10 text-emerald-500 opacity-80" />
            <h3 className="text-sm font-bold text-slate-800">No items found</h3>
            <p className="mt-1 text-xs text-slate-600">There are no items for this store, status, or search.</p>
          </div>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[1120px] border-collapse text-left text-xs">
              <thead><tr className="bg-[#ff0066] text-center text-[10px] font-black uppercase text-black">
                {['Bought / Status', 'Store', 'Customer', 'Items', 'Price', 'Qty', 'Line Amount', 'Total Groceries', 'Pasabuy Fee', 'Total', 'Actions'].map(label => <th key={label} className="border border-black px-2 py-2">{label}</th>)}
              </tr></thead>
              <tbody>
                {filteredItems.map(item => {
                  const parentOrder = ordersById.get(item.orderId);
                  const displayStatus = getBuyingStatus(item);
                  const isPurchased = displayStatus === 'PURCHASED' || displayStatus === 'BOUGHT_FROM_STOCK';
                  const isPending = displayStatus === 'PENDING';
                  const orderIsCancelled = parentOrder?.status === 'CANCELLED';
                  const orderIsCompleted = parentOrder?.status === 'COMPLETED';
                  const price = item.actualPrice ?? item.estimatedPrice;
                  const lineAmount = roundMoney(item.qty * price);
                  const isBoughtFromStock = displayStatus === 'BOUGHT_FROM_STOCK';
                  const matchingStockProduct = (products || []).find(p => p.name.trim().toLowerCase() === item.productName.trim().toLowerCase() && p.isStockItem);
                  const availableStock = matchingStockProduct?.stockQuantity || 0;
                  const hasStockAvailable = !!matchingStockProduct && availableStock >= item.qty;
                  const isRestocked = (displayStatus === 'BACKORDER' || !!item.expectedRestockDate) && !!matchingStockProduct && availableStock >= item.qty;
                  const needsPurchaseFollowup = isPending || displayStatus === 'BACKORDER' || displayStatus === 'ALTERNATIVE_SELECTED';
                  const orderItemsForView = visibleItemsByOrder.get(item.orderId) || [];
                  const isLastVisibleOrderItem = orderItemsForView[orderItemsForView.length - 1]?.id === item.id;
                  const orderSummary = printableOrderSummaries.get(item.orderId);
                  const rowClass = isRestocked
                    ? 'bg-emerald-100 hover:bg-emerald-200'
                    : orderIsCompleted
                      ? 'bg-emerald-100 hover:bg-emerald-200'
                      : displayStatus === 'REORDER'
                        ? 'bg-yellow-100 hover:bg-yellow-200/80'
                        : displayStatus === 'BACKORDER'
                          ? 'bg-orange-100 hover:bg-orange-200'
                          : displayStatus === 'ALTERNATIVE_SELECTED'
                            ? 'bg-blue-100 hover:bg-blue-200'
                            : displayStatus === 'UNAVAILABLE'
                              ? 'bg-red-200 hover:bg-red-300/80'
                              : displayStatus === 'CANCELLED'
                                ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                                : 'bg-white hover:bg-pink-50/50';
                  const badgeClass = isRestocked
                    ? 'bg-emerald-600 text-white'
                    : orderIsCompleted
                      ? 'bg-emerald-600 text-white'
                      : displayStatus === 'BACKORDER'
                        ? 'bg-orange-200 text-orange-950'
                        : displayStatus === 'ALTERNATIVE_SELECTED'
                          ? 'bg-blue-200 text-blue-950'
                          : displayStatus === 'REORDER'
                            ? 'bg-yellow-300 text-yellow-950'
                            : displayStatus === 'UNAVAILABLE'
                              ? 'bg-red-600 text-white'
                              : displayStatus === 'CANCELLED'
                                ? 'bg-slate-300 text-slate-800'
                                : isPurchased
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-emerald-100 text-emerald-800';
                  const badgeLabel = isRestocked
                    ? 'RESTOCKED / AVAILABLE'
                    : orderIsCompleted
                      ? 'COMPLETED'
                      : displayStatus === 'REORDER'
                        ? 'RE-ORDERED'
                        : displayStatus === 'BACKORDER'
                          ? 'BACKORDER'
                          : displayStatus === 'ALTERNATIVE_SELECTED'
                            ? 'ALTERNATIVE SELECTED'
                            : displayStatus === 'UNAVAILABLE'
                              ? 'NOT AVAILABLE'
                              : displayStatus === 'CANCELLED'
                                ? 'CANCELLED'
                                : isPurchased
                                  ? (isBoughtFromStock ? 'BOUGHT / ON HAND' : 'BOUGHT')
                                  : 'ACTIVE';

                  return <tr key={item.id} className={`border-b border-slate-200 transition-colors ${rowClass}`}>
                    <td className="whitespace-nowrap px-2 py-2 font-bold"><span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-black tracking-wide ${badgeClass}`}>{badgeLabel}</span></td>
                    <td className="px-2 py-2 font-semibold">{item.storeName || 'Store'}</td>
                    <td className="max-w-40 px-2 py-2"><span className="font-semibold text-slate-800">{parentOrder?.customerName || 'Walk-in Customer'}</span>{parentOrder && <small className="mt-0.5 block text-slate-500">{parentOrder.orderNo}</small>}</td>
                    <td className="px-2 py-2"><span className="font-semibold text-slate-900">{item.productName}</span>{item.notes && <small className="mt-0.5 block text-slate-600">Note: {item.notes}</small>}{isPending && matchingStockProduct && availableStock > 0 && <small className={`mt-1 inline-flex rounded-md px-1.5 py-0.5 font-semibold ${hasStockAvailable ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{hasStockAvailable ? `In stock: ${availableStock} ${item.unit}` : `Stock alert: ${availableStock} ${item.unit} available · ${item.qty - availableStock} short`}</small>}{isPending && matchingStockProduct && availableStock <= 0 && <small className="mt-1 inline-flex rounded-md bg-red-100 px-1.5 py-0.5 font-semibold text-red-800">Out of stock</small>}{isRestocked && <small className="mt-1 inline-flex rounded-md bg-emerald-200 px-1.5 py-0.5 font-semibold text-emerald-900">Restocked: {availableStock} {item.unit} · follow up to buy</small>}{item.selectedAlternativeProductName && <small className="mt-1 block text-blue-900">Option: {item.selectedAlternativeProductName} · {item.selectedAlternativeSupplier} · ₱{item.selectedAlternativePrice?.toFixed(2)} ({(item.selectedAlternativePrice || 0) - item.estimatedPrice >= 0 ? '+' : '−'}₱{Math.abs((item.selectedAlternativePrice || 0) - item.estimatedPrice).toFixed(2)})</small>}{item.expectedRestockDate && <small className="mt-0.5 block text-slate-600">Expected restock: {item.expectedRestockDate}</small>}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right">₱{price.toFixed(2)}<small className="block text-slate-500">/{item.unit}</small></td>
                    <td className="px-2 py-2 text-center">{item.qty}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right font-semibold">₱{lineAmount.toFixed(2)}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right font-semibold">{isLastVisibleOrderItem && orderSummary ? `₱${orderSummary.subtotal.toFixed(2)}` : ''}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right">{isLastVisibleOrderItem && orderSummary ? `₱${orderSummary.fee.toFixed(2)}` : ''}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right font-black">{isLastVisibleOrderItem && orderSummary ? <><span>₱{orderSummary.grandTotal.toFixed(2)}</span>{(orderSummary.delivery > 0 || orderSummary.discount > 0) && <small className="block font-normal text-slate-600">{orderSummary.delivery > 0 ? `Rider +₱${orderSummary.delivery.toFixed(2)}` : ''}{orderSummary.delivery > 0 && orderSummary.discount > 0 ? ' · ' : ''}{orderSummary.discount > 0 ? `Disc. −₱${orderSummary.discount.toFixed(2)}` : ''}</small>}</> : ''}</td>
                    <td className="min-w-[19rem] px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        {needsPurchaseFollowup && !orderIsCancelled && !orderIsCompleted && <>
                          <div className="flex w-full flex-wrap items-center gap-1.5">
                            {hasStockAvailable && <button onClick={() => handleFulfillFromStock(item)} className="flex items-center gap-1 rounded-lg bg-pink-100 px-2.5 py-2 text-[10px] font-bold text-pink-800 hover:bg-pink-200" title={`Fulfill from ${availableStock} units of on-hand stock`}><Boxes className="h-3 w-3" />Use stock ({availableStock})</button>}
                            <button onClick={() => handleOpenPurchase(item)} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-2 text-[10px] font-bold text-white hover:bg-emerald-700"><Check className="h-3 w-3" />Bought</button>
                          </div>
                          <div className="flex w-full flex-wrap items-center gap-1.5 border-t border-slate-300/70 pt-2">
                            <button onClick={() => handleSetStatus(item, 'REORDER')} className="flex items-center gap-1 rounded-lg bg-yellow-200 px-2.5 py-2 text-[10px] font-bold text-yellow-950 hover:bg-yellow-300"><RotateCcw className="h-3 w-3" />Re-order</button>
                            <button aria-label={`Mark ${item.productName} unavailable`} title="Mark unavailable" onClick={() => void handleMarkUnavailableAndOpen(item)} className="flex items-center gap-1 rounded-lg bg-red-100 px-2.5 py-2 text-[10px] font-bold text-red-800 hover:bg-red-200"><XCircle className="h-3.5 w-3.5" />Not available</button>
                            <button aria-label={`Cancel ${item.productName}`} title="Cancel item" onClick={() => setCancelItemTarget(item)} className="flex items-center gap-1 rounded-lg bg-slate-200 px-2.5 py-2 text-[10px] font-bold text-slate-700 hover:bg-red-100 hover:text-red-800"><Ban className="h-3 w-3" />Cancel</button>
                          </div>
                        </>}
                        {isPurchased && !orderIsCancelled && !orderIsCompleted && <>
                          <span className="text-[10px] font-semibold text-emerald-700">{isBoughtFromStock ? 'From Stock' : 'Purchased'}</span>
                          <button onClick={() => handleSetStatus(item, 'PENDING')} className="flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-200" title="Reset to pending"><RotateCcw className="h-3 w-3" />Undo</button>
                        </>}
                        {displayStatus === 'REORDER' && !orderIsCancelled && !orderIsCompleted && <div className="flex w-full flex-wrap items-center gap-1.5 border-t border-slate-300/70 pt-2">
                          <button onClick={() => handleOpenPurchase(item)} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-2 text-[10px] font-bold text-white hover:bg-emerald-700"><Check className="h-3 w-3" />Bought</button>
                        </div>}
                        {(displayStatus === 'UNAVAILABLE' || displayStatus === 'BACKORDER' || displayStatus === 'ALTERNATIVE_SELECTED') && !orderIsCancelled && !orderIsCompleted && <button onClick={() => openUnavailablePanel(item)} className="rounded-lg bg-white px-2 py-1.5 text-[10px] font-semibold text-slate-700 shadow-sm hover:bg-slate-100">Review options</button>}
                        {displayStatus === 'CANCELLED' && !orderIsCancelled && !orderIsCompleted && <button onClick={() => handleSetStatus(item, 'PENDING')} className="rounded-lg bg-white px-2 py-1.5 text-[10px] font-semibold text-slate-700 shadow-sm hover:bg-slate-100">Restore</button>}
                        {orderIsCancelled && <span className="text-[10px] font-semibold text-slate-500">Order cancelled</span>}
                        {orderIsCompleted && <span className="text-[10px] font-semibold text-emerald-700">Order complete</span>}
                        {isLastVisibleOrderItem && parentOrder && (currentUser?.role === 'Admin' || currentUser?.role === 'Staff') && <button type="button" onClick={() => setDeleteOrderTarget(parentOrder)} title={`Move ${parentOrder.orderNo} to Archive`} className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[10px] font-bold text-slate-700 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-800"><Trash2 className="h-3.5 w-3.5" />Archive order</button>}
                      </div>
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {unavailableItem && createPortal(
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setUnavailableItem(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby="unavailable-panel-title" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-red-700">Recommendation panel</p>
                <h3 id="unavailable-panel-title" className="mt-1 text-lg font-black text-slate-900">{unavailableItem.productName}</h3>
                <p className="mt-0.5 text-xs text-slate-500">Original quantity: {unavailableItem.qty} {unavailableItem.unit} · Original estimate: ₱{unavailableItem.estimatedPrice.toFixed(2)} / {unavailableItem.unit}</p>
                <span className="mt-2 inline-flex rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-black tracking-wide text-red-800">NOT AVAILABLE</span>
              </div>
              <button type="button" onClick={() => setUnavailableItem(null)} aria-label="Close recommendations" className="rounded-xl bg-slate-100 p-2 text-slate-600 hover:bg-slate-200"><X className="h-4 w-4" /></button>
            </div>

            <div className="mt-4 rounded-2xl border border-red-100 bg-red-50/70 p-3">
              <label className="block text-xs font-bold text-slate-800">Reason supplier could not provide this item</label>
              <textarea value={unavailableReason} onChange={event => setUnavailableReason(event.target.value)} rows={2} placeholder="For example: temporarily out of stock" className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-300" />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
                <span>Marked by {unavailableItem.unavailableBy || staffName}{unavailableItem.unavailableAt ? ` · ${new Date(unavailableItem.unavailableAt).toLocaleString()}` : ''}</span>
                <button type="button" onClick={handleRecordUnavailable} className="rounded-lg bg-red-700 px-3 py-2 font-bold text-white hover:bg-red-800">{unavailableItem.status === 'UNAVAILABLE' ? 'Save reason' : 'Record unavailable'}</button>
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 p-3 text-xs">
              <p className="font-black text-blue-950">Recommended action</p>
              <p className="mt-1 text-blue-900">{recommendedAlternative
                ? `Review ${recommendedAlternative.name} from ${recommendedAlternative.store} at ₱${recommendedAlternative.price.toFixed(2)} per ${recommendedAlternative.unit} (lowest recorded catalog price among matches).`
                : expectedRestockDate
                  ? `Wait for the expected restock on ${expectedRestockDate}, then verify availability before buying.`
                  : 'No matching alternative supplier is recorded. Backorder the item or wait for restocking.'}</p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-3 sm:col-span-2">
                <div className="flex items-center gap-2">
                  <PackageSearch className="h-4 w-4 text-blue-700" />
                  <h4 className="text-sm font-black text-slate-900">Find another supplier</h4>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">Search recorded POS products. Choosing one records it for review; the original order item and price stay unchanged.</p>
                <input value={supplierSearch} onChange={event => setSupplierSearch(event.target.value)} placeholder="Search product or category in catalog..." className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-blue-300" />
                <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">
                  {alternativeProducts.map(product => {
                    const difference = product.price - unavailableItem.estimatedPrice;
                    return <div key={product.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-2.5">
                      <div className="min-w-0"><p className="truncate text-xs font-bold text-slate-900">{product.name}</p><p className="text-[10px] text-slate-600">Supplier: {product.store} · ₱{product.price.toFixed(2)} / {product.unit}</p><p className={`text-[10px] font-semibold ${difference <= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>Difference: {difference < 0 ? '−' : '+'}₱{Math.abs(difference).toFixed(2)} per unit</p></div>
                      <button type="button" onClick={() => handleSelectAlternative(product)} className="shrink-0 rounded-lg bg-blue-700 px-3 py-2 text-[10px] font-bold text-white hover:bg-blue-800">Select for review</button>
                    </div>;
                  })}
                  {!!supplierSearch.trim() && alternativeProducts.length === 0 && <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">No matching products from another recorded supplier are in the POS catalog.</p>}
                </div>
              </div>

              <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-3">
                <div className="flex items-center gap-2"><RotateCcw className="h-4 w-4 text-orange-700" /><h4 className="text-sm font-black text-slate-900">Backorder</h4></div>
                <p className="mt-1 text-[11px] text-slate-600">Keep this item in the list and flag it for supplier follow-up.</p>
                <button type="button" onClick={handleBackorder} className="mt-3 w-full rounded-lg bg-orange-600 px-3 py-2 text-xs font-bold text-white hover:bg-orange-700">Add to backorder</button>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3">
                <div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-emerald-700" /><h4 className="text-sm font-black text-slate-900">Wait for restocking</h4></div>
                <p className="mt-1 text-[11px] text-slate-600">Keep it pending; available catalog stock will show a live restock notice.</p>
                <input type="date" value={expectedRestockDate} onChange={event => setExpectedRestockDate(event.target.value)} aria-label="Expected restock date" className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs" />
                <button type="button" onClick={handleWaitForRestock} className="mt-2 w-full rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800">Keep pending</button>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><h4 className="text-sm font-black text-slate-900">Remove item</h4><p className="mt-1 text-[11px] text-slate-600">Soft-removes it from the buying list after confirmation and keeps its order history.</p></div>
                  <button type="button" onClick={handleRemoveUnavailableItem} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50">Remove item…</button>
                </div>
              </div>
            </div>

            {!!unavailableItem.availabilityHistory?.length && <div className="mt-4 rounded-2xl border border-slate-200 p-3">
              <div className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-slate-600" /><h4 className="text-xs font-black text-slate-800">Availability history</h4></div>
              <ul className="mt-2 max-h-32 space-y-1.5 overflow-y-auto text-[10px] text-slate-600">
                {[...unavailableItem.availabilityHistory].reverse().map((entry, index) => <li key={`${entry.at}-${index}`} className="border-l-2 border-slate-200 pl-2"><strong className="text-slate-800">{entry.action}</strong> · {entry.by} · {new Date(entry.at).toLocaleString()}{entry.reason && <> · {entry.reason}</>}{entry.expectedRestockDate && <> · Expected {entry.expectedRestockDate}</>}{entry.alternativeProductName && <> · {entry.alternativeProductName} ({entry.alternativeSupplier}) · Δ ₱{entry.priceDifference?.toFixed(2)}</>}</li>)}
              </ul>
            </div>}
          </section>
        </div>, document.body
      )}

      {/* Actual Price Prompt Modal */}
      {itemToPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5 border border-slate-200 space-y-4">
            <div>
              <span className="text-[10px] font-bold text-pink-700 uppercase tracking-wider">
                Confirm Purchase
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-0.5">
                {itemToPurchase.qty}x {itemToPurchase.selectedAlternativeProductName || itemToPurchase.productName}
              </h3>
              <p className="text-xs text-slate-500">
                {itemToPurchase.selectedAlternativeProductName
                  ? `Alternative for ${itemToPurchase.productName} · Supplier: ${itemToPurchase.selectedAlternativeSupplier} · Est: ₱${(itemToPurchase.selectedAlternativePrice || 0).toFixed(2)}`
                  : `Store: ${itemToPurchase.storeName} · Est: ₱${itemToPurchase.estimatedPrice.toFixed(2)}`}
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Actual Purchase Unit Price (₱) *
              </label>
              <input
                type="number"
                min="0"
                step="any"
                autoFocus
                value={actualPriceInput}
                onChange={e => setActualPriceInput(e.target.value)}
                className="w-full px-3 py-2 text-lg font-black text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-pink-600"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Total will be: ₱{roundMoney(itemToPurchase.qty * (parseFloat(actualPriceInput) || 0)).toFixed(2)}
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setItemToPurchase(null)}
                className="flex-1 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPurchase}
                className="flex-1 py-2.5 text-xs font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 shadow-xs"
              >
                Confirm Purchased
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
