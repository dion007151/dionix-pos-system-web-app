import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Printer, X, Check } from 'lucide-react';
import { calculateOrderSummary } from '../../services/calc';

export const ThermalReceiptModal: React.FC = () => {
  const { receiptModal, closeReceiptModal, activeProfile, businessInfo } = useApp();
  const { isOpen, order, restoOrder } = receiptModal;
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm'>('80mm');
  const [isPrinting, setIsPrinting] = useState(false);

  if (!isOpen || (!order && !restoOrder)) return null;

  const isPasabuy = activeProfile === 'ANTIQUE_PASABUY';
  const pasabuySummary = order ? calculateOrderSummary(order) : null;

  const handlePrint = () => {
    setIsPrinting(true);
    const receiptEl = document.getElementById('printable-receipt');
    if (!receiptEl) {
      window.print();
      setIsPrinting(false);
      return;
    }

    // Clean up any existing print iframe
    const oldIframe = document.getElementById('thermal-print-frame');
    if (oldIframe) {
      oldIframe.remove();
    }

    // Create a hidden iframe dedicated to printing
    const iframe = document.createElement('iframe');
    iframe.id = 'thermal-print-frame';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      window.print();
      setIsPrinting(false);
      return;
    }

    const printWidth = paperWidth === '58mm' ? '54mm' : '76mm';
    const pageStyle = paperWidth === '58mm' ? '58mm auto' : '80mm auto';
    const fontSize = paperWidth === '58mm' ? '10px' : '11px';

    const parentStyles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map(el => el.outerHTML)
      .join('\n');

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Receipt - ${order ? order.orderNo : restoOrder?.orderNo || 'POS'}</title>
          ${parentStyles}
          <style>
            @page {
              size: ${pageStyle};
              margin: 2mm 0;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            body {
              width: ${printWidth};
              max-width: 100%;
              margin: 0 auto;
              padding: 2mm 1.5mm;
              font-size: ${fontSize};
              line-height: 1.35;
              color: #000 !important;
              background: #fff !important;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            /* Grid and Flex Layout guarantees */
            .grid { display: grid !important; }
            .grid-cols-12 { display: grid !important; grid-template-columns: repeat(12, minmax(0, 1fr)) !important; }
            .col-span-2 { grid-column: span 2 / span 2 !important; }
            .col-span-4 { grid-column: span 4 / span 4 !important; }
            .col-span-6 { grid-column: span 6 / span 6 !important; }
            .flex { display: flex !important; }
            .justify-between { display: flex !important; justify-content: space-between !important; }
            .items-center { align-items: center !important; }
            .flex-wrap { flex-wrap: wrap !important; }
            .gap-1 { gap: 0.25rem !important; }
            .gap-2 { gap: 0.5rem !important; }
            
            /* Spacing */
            .space-y-0\\.5 > * + * { margin-top: 2px !important; }
            .space-y-1 > * + * { margin-top: 4px !important; }
            .my-2 { margin-top: 8px !important; margin-bottom: 8px !important; }
            .my-3 { margin-top: 12px !important; margin-bottom: 12px !important; }
            .py-1 { padding-top: 3px !important; padding-bottom: 3px !important; }
            .pt-1 { padding-top: 4px !important; }
            .pb-1 { padding-bottom: 3px !important; }
            .pr-1 { padding-right: 4px !important; }
            
            /* Text & Typography */
            .text-center { text-align: center !important; }
            .text-right { text-align: right !important; }
            .text-left { text-align: left !important; }
            .font-bold { font-weight: 700 !important; }
            .font-semibold { font-weight: 600 !important; }
            .font-medium { font-weight: 500 !important; }
            .uppercase { text-transform: uppercase !important; }
            .truncate { overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }
            .line-through { text-decoration: line-through !important; }
            .text-xs { font-size: 11px !important; }
            .text-sm { font-size: 13px !important; }
            .text-\\[9px\\] { font-size: 9px !important; }
            .text-\\[10px\\] { font-size: 10px !important; }
            .text-\\[11px\\] { font-size: 11px !important; }
            .text-gray-700, .text-gray-600, .text-gray-500 { color: #333 !important; }
            .text-black { color: #000 !important; }

            /* Borders */
            .border-t { border-top-width: 1px !important; border-top-style: solid !important; }
            .border-b { border-bottom-width: 1px !important; border-bottom-style: solid !important; }
            .border-dashed { border-style: dashed !important; border-color: #666 !important; }
            .border-gray-400, .border-gray-300 { border-color: #777 !important; }
            .border-gray-100 { border-color: #e5e7eb !important; }
          </style>
        </head>
        <body>
          ${receiptEl.innerHTML}
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.error('Print failed:', err);
        window.print();
      } finally {
        setIsPrinting(false);
        setTimeout(() => {
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        }, 1500);
      }
    }, 300);
  };

  return (
    <div className="thermal-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
      <div className="thermal-modal-card relative flex flex-col w-full max-w-sm max-h-[92vh] bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200">
        {/* Modal Top Actions */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200 print:hidden">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-pink-100 flex items-center justify-center text-[#C90052]">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-800">Thermal Receipt</h3>
              <p className="text-[10px] text-slate-400">Ready to print</p>
            </div>
          </div>

          {/* Paper Size selector */}
          <div className="flex items-center bg-slate-200/70 p-0.5 rounded-lg text-[10px] font-bold">
            <button
              onClick={() => setPaperWidth('80mm')}
              className={`px-2 py-1 rounded-md transition-all ${paperWidth === '80mm'
                ? 'bg-white text-slate-800 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
                }`}
            >
              80mm
            </button>
            <button
              onClick={() => setPaperWidth('58mm')}
              className={`px-2 py-1 rounded-md transition-all ${paperWidth === '58mm'
                ? 'bg-white text-slate-800 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
                }`}
            >
              58mm
            </button>
          </div>

          <button
            onClick={closeReceiptModal}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Printable Area */}
        <div
          id="printable-receipt"
          className={`flex-1 p-4 sm:p-5 overflow-y-auto font-mono text-xs text-black bg-white ${paperWidth === '58mm' ? 'max-w-[280px] mx-auto text-[11px]' : ''
            }`}
        >
          {/* Header */}
          <div className="text-center space-y-0.5">
            <h2 className="font-bold text-sm tracking-wide">
              {isPasabuy ? (businessInfo.storeName || 'ANTIQUE PASABUY & RETAIL') : "ANGELITO'S BAR & RESTO GRILL"}
            </h2>
            <p className="text-[10px] text-gray-600">
              {isPasabuy
                  ? (businessInfo.address || 'San Angel, San Jose de Buenavista, Antique 5700')
                  : 'Main St., San Jose de Buenavista'}
            </p>
            <p className="text-[10px] text-gray-600">Mobile: {businessInfo.phone || '09054853573'}</p>
            {isPasabuy && businessInfo.email && <p className="text-[10px] text-gray-600">{businessInfo.email}</p>}
            <p className="text-[10px] text-gray-500 font-sans mt-1">
              {businessInfo.receiptFooter || '*** OFFICIAL RECEIPT ***'}
            </p>
          </div>

          <div className="my-2 border-t border-dashed border-gray-400" />

          {/* Details */}
          <div className="space-y-0.5 text-[11px]">
            <div className="flex justify-between">
              <span>Order No:</span>
              <span className="font-bold">{order ? order.orderNo : restoOrder?.orderNo}</span>
            </div>
            <div className="flex justify-between">
              <span>Date:</span>
              <span>
                {new Date((order?.createdAt || restoOrder?.createdAt) || new Date()).toLocaleString('en-PH', {
                  dateStyle: 'short',
                  timeStyle: 'short'
                })}
              </span>
            </div>

            {order && (
              <>
                <div className="flex justify-between">
                  <span>Customer:</span>
                  <span className="font-bold">{order.customerName || 'Walk-in'}</span>
                </div>
                {order.customerPhone && (
                  <div className="flex justify-between gap-2">
                    <span>Mobile:</span>
                    <span className="text-right">{order.customerPhone}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Type:</span>
                  <span>{order.deliveryType}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>{order.deliveryType === 'DELIVERY' ? 'Address:' : 'Pickup:'}</span>
                  <span className="max-w-[65%] text-right">
                    {order.deliveryType === 'DELIVERY' ? order.address : 'Store Pickup'}
                  </span>
                </div>
                {order.addressNote && (
                  <div className="flex justify-between gap-2">
                    <span>Landmark:</span>
                    <span className="max-w-[65%] text-right">{order.addressNote}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Payment:</span>
                  <span>{order.paymentMethod || 'To be confirmed'}</span>
                </div>
                {order.changeFor && (
                  <div className="flex justify-between">
                    <span>Change for:</span>
                    <span>₱{order.changeFor.toFixed(2)}</span>
                  </div>
                )}
                {order.deliveryTime && (
                  <div className="flex justify-between">
                    <span>Delivery date:</span>
                    <span>
                      {order.deliveryTime === 'ASAP'
                        ? 'ASAP'
                        : new Date(`${order.deliveryTime}T00:00:00`).toLocaleDateString('en-PH')}
                    </span>
                  </div>
                )}
              </>
            )}

            {restoOrder && (
              <>
                <div className="flex justify-between">
                  <span>Table / Type:</span>
                  <span className="font-bold">{restoOrder.tableName || restoOrder.orderType}</span>
                </div>
                {restoOrder.serverName && (
                  <div className="flex justify-between">
                    <span>Server:</span>
                    <span>{restoOrder.serverName}</span>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="my-2 border-t border-dashed border-gray-400" />

          {/* Cancelled Order Banner */}
          {order?.status === 'CANCELLED' && (
            <div className="my-2 py-1 bg-red-100 border border-red-300 text-red-700 text-center font-bold text-xs uppercase tracking-wider rounded">
              *** ORDER CANCELLED ***
            </div>
          )}

          {/* Items Header */}
          <div className="grid grid-cols-12 text-[10px] font-bold text-gray-700 pb-1">
            <span className="col-span-2">QTY</span>
            <span className="col-span-6">ITEM</span>
            <span className="col-span-4 text-right">TOTAL</span>
          </div>

          {/* Pasabuy Items */}
          {order && order.items && (
            <div className="space-y-1 py-1">
              {order.items.map((item, idx) => {
                const price = item.actualPrice ?? item.estimatedPrice;
                const total = item.qty * price;
                const isUnavailable = item.status === 'UNAVAILABLE';
                const isCancelled = item.status === 'CANCELLED';
                const isReorder = item.status === 'REORDER';
                const hasExcess = item.purchasedQty != null && item.purchasedQty > item.qty;
                const excessQty = hasExcess ? item.purchasedQty! - item.qty : 0;

                return (
                  <div key={idx} className="py-1 border-b border-dashed border-gray-100">
                    <div
                      className={`grid grid-cols-12 text-[11px] ${isCancelled || isUnavailable ? 'text-red-600' : isReorder ? 'text-amber-700' : ''
                        }`}
                    >
                      <span className="col-span-2 font-semibold">{item.qty}x</span>
                      <span className={`col-span-6 truncate pr-1 ${isCancelled ? 'line-through' : ''}`}>
                        {item.productName}
                      </span>
                      <span className="col-span-4 text-right font-medium">
                        {isCancelled ? (
                          <span className="px-1 py-0.5 bg-red-100 text-red-700 border border-red-300 rounded text-[9px] font-bold">
                            CANCEL
                          </span>
                        ) : isUnavailable ? (
                          <span>—</span>
                        ) : isReorder ? (
                          <span className="px-1 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded text-[9px] font-bold">
                            REORDER
                          </span>
                        ) : (
                          `₱${total.toFixed(2)}`
                        )}
                      </span>
                    </div>
                    {/* Status & Excess Badges */}
                    {(isCancelled || isUnavailable || isReorder || hasExcess) && (
                      <div className="flex flex-wrap gap-1 pl-4 mt-0.5 text-[9px] font-bold">
                        {isCancelled && (
                          <span className="px-1.5 py-0.5 bg-red-100 text-red-700 border border-red-300 rounded">
                            [CANCELLED]
                          </span>
                        )}
                        {isUnavailable && (
                          <span className="px-1.5 py-0.5 bg-red-100 text-red-700 border border-red-300 rounded">
                            [NOT AVAILABLE]
                          </span>
                        )}
                        {isReorder && (
                          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded">
                            [REORDER]
                          </span>
                        )}
                        {hasExcess && (
                          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded">
                            [+{excessQty % 1 === 0 ? excessQty : excessQty.toFixed(2)} EXCESS]
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Resto Items */}
          {restoOrder && restoOrder.items && (
            <div className="space-y-1 py-1">
              {restoOrder.items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 text-[11px]">
                  <span className="col-span-2 font-semibold">{item.qty}x</span>
                  <span className="col-span-6 truncate pr-1">{item.name}</span>
                  <span className="col-span-4 text-right">₱{(item.qty * item.price).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="my-2 border-t border-dashed border-gray-400" />

          {/* Financial Breakdown */}
          {order && pasabuySummary && (
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span>Items Subtotal:</span>
                <span>₱{pasabuySummary.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Pasabuy Fee:</span>
                <span>₱{pasabuySummary.fee.toFixed(2)}</span>
              </div>
              {order.additionalFeeNote && (
                <div className="text-[9px] text-gray-600">{order.additionalFeeNote}</div>
              )}
              {pasabuySummary.delivery > 0 && (
                <div className="flex justify-between">
                  <span>Delivery Fee:</span>
                  <span>₱{pasabuySummary.delivery.toFixed(2)}</span>
                </div>
              )}
              {pasabuySummary.discount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Discount:</span>
                  <span>-₱{pasabuySummary.discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-sm pt-1 border-t border-dashed border-gray-300">
                <span>TOTAL BILL:</span>
                <span>₱{pasabuySummary.grandTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-700">
                <span>Amount Paid:</span>
                <span>₱{pasabuySummary.paid.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Balance Due:</span>
                <span>₱{pasabuySummary.balance.toFixed(2)}</span>
              </div>
            </div>
          )}

          {restoOrder && (
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>₱{restoOrder.subtotal.toFixed(2)}</span>
              </div>
              {restoOrder.serviceCharge > 0 && (
                <div className="flex justify-between">
                  <span>Service Charge:</span>
                  <span>₱{restoOrder.serviceCharge.toFixed(2)}</span>
                </div>
              )}
              {restoOrder.discount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Discount:</span>
                  <span>-₱{restoOrder.discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-sm pt-1 border-t border-dashed border-gray-300">
                <span>TOTAL AMOUNT:</span>
                <span>₱{restoOrder.total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Payment Method:</span>
                <span>{restoOrder.paymentMethod || 'Cash'}</span>
              </div>
            </div>
          )}

          <div className="my-3 border-t border-dashed border-gray-400" />

          {/* Footer */}
          <div className="text-center space-y-1 text-[10px] text-gray-600">
            <p className="font-semibold">
              {isPasabuy
                ? 'Thank you for your order!'
                : 'Thank you for dining with us!'}
            </p>
            <p className="text-[9px]">San Jose de Buenavista, Antique</p>
          </div>
        </div>

        {/* Modal Bottom Actions */}
        <div className="flex gap-2 p-3 bg-slate-50 border-t border-slate-200 print:hidden">
          <button
            onClick={closeReceiptModal}
            className="flex-1 px-3 py-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition-colors"
          >
            Close
          </button>
          <button
            onClick={handlePrint}
            disabled={isPrinting}
            className="flex items-center justify-center flex-1 gap-1.5 px-3 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-[#C90052] to-[#FF0066] hover:from-[#b00048] hover:to-[#e6005c] rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-60"
          >
            <Printer className="w-4 h-4" />
            <span>{isPrinting ? 'Printing...' : `Print (${paperWidth})`}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
