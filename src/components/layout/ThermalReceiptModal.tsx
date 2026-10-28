import React from 'react';
import { useApp } from '../../context/AppContext';
import { Printer, X } from 'lucide-react';
import { calculateOrderSummary } from '../../services/calc';

export const ThermalReceiptModal: React.FC = () => {
  const { receiptModal, closeReceiptModal, activeProfile } = useApp();
  const { isOpen, order, restoOrder } = receiptModal;

  if (!isOpen || (!order && !restoOrder)) return null;

  const isPasabuy = activeProfile === 'ANTIQUE_PASABUY';

  const handlePrint = () => {
    window.print();
  };

  const pasabuySummary = order ? calculateOrderSummary(order) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative flex flex-col w-full max-w-sm max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
        {/* Modal Top Actions */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-100 border-b border-slate-200 print:hidden">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <Printer className="w-4 h-4 text-purple-700" />
            <span>Thermal Receipt Preview</span>
          </div>
          <button
            onClick={closeReceiptModal}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Area */}
        <div
          id="printable-receipt"
          className="flex-1 p-5 overflow-y-auto font-mono text-xs text-black bg-white"
        >
          {/* Header */}
          <div className="text-center space-y-1">
            <h2 className="font-bold text-sm tracking-wide">
              {isPasabuy
                ? 'ANTIQUE PASABUY & RETAIL'
                : "ANGELITO'S BAR & RESTO GRILL"}
            </h2>
            <p className="text-[10px] text-gray-600">
              {isPasabuy
                ? 'San Jose de Buenavista, Antique'
                : 'Main St., San Jose de Buenavista'}
            </p>
            <p className="text-[10px] text-gray-600">Tel: (036) 540-1234 / 0917-888-1234</p>
            <p className="text-[10px] text-gray-500 font-sans mt-0.5">
              *** OFFICIAL RECEIPT ***
            </p>
          </div>

          <div className="my-2 border-t border-dashed border-gray-400" />

          {/* Details */}
          <div className="space-y-0.5 text-[11px]">
            <div className="flex justify-between">
              <span>Order No:</span>
              <span className="font-bold">
                {order ? order.orderNo : restoOrder?.orderNo}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Date:</span>
              <span>
                {new Date(
                  (order?.createdAt || restoOrder?.createdAt) || new Date()
                ).toLocaleString('en-PH', {
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
                <div className="flex justify-between">
                  <span>Type:</span>
                  <span>{order.deliveryType}</span>
                </div>
              </>
            )}

            {restoOrder && (
              <>
                <div className="flex justify-between">
                  <span>Table / Type:</span>
                  <span className="font-bold">
                    {restoOrder.tableName || restoOrder.orderType}
                  </span>
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
                const price = item.actualPrice || item.estimatedPrice;
                const total = item.qty * price;
                const isUnavailable = item.status === 'UNAVAILABLE';
                const isCancelled = item.status === 'CANCELLED';
                const isReorder = item.status === 'REORDER';
                const hasExcess = item.purchasedQty != null && item.purchasedQty > item.qty;
                const excessQty = hasExcess ? (item.purchasedQty! - item.qty) : 0;

                return (
                    <div key={idx} className="py-1 border-b border-dashed border-gray-100">
                      <div className={`grid grid-cols-12 text-[11px] ${isCancelled || isUnavailable ? 'text-red-600' : isReorder ? 'text-amber-700' : ''}`}>
                        <span className="col-span-2 font-semibold">{item.qty}x</span>
                        <span className={`col-span-6 truncate pr-1 ${isCancelled ? 'line-through' : ''}`}>
                          {item.productName}
                        </span>
                        <span className="col-span-4 text-right font-medium">
                          {isCancelled ? (
                            <span className="px-1 py-0.5 bg-red-100 text-red-700 border border-red-300 rounded text-[9px] font-bold">CANCEL</span>
                          ) : isUnavailable ? (
                            <span>—</span>
                          ) : isReorder ? (
                            <span className="px-1 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded text-[9px] font-bold">REORDER</span>
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
                )
              }

          {/* Resto Items */ }
          { restoOrder && restoOrder.items && (
                  <div className="space-y-1 py-1">
                    {restoOrder.items.map((item, idx) => (
                      <div key={idx} className="grid grid-cols-12 text-[11px]">
                        <span className="col-span-2 font-semibold">{item.qty}x</span>
                        <span className="col-span-6 truncate pr-1">{item.name}</span>
                        <span className="col-span-4 text-right">
                          ₱{(item.qty * item.price).toFixed(2)}
                        </span>
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
                    <span>TOTAL AMOUNT:</span>
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
                    ? 'Thank you for trusting Antique Pasabuy!'
                    : 'Thank you for dining with us! Come again!'}
                </p>
                <p className="text-[9px]">DIONIX POS System · Fast & Reliable</p>
              </div>
            </div>

        {/* Modal Bottom Actions */}
          <div className="flex gap-2 p-3 bg-slate-50 border-t border-slate-200 print:hidden">
            <button
              onClick={closeReceiptModal}
              className="flex-1 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-100"
            >
              Close
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center justify-center flex-1 gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-purple-700 rounded-xl hover:bg-purple-800 shadow-xs"
            >
              <Printer className="w-4 h-4" />
              <span>Print Receipt</span>
            </button>
          </div>
        </div>
      </div>
      );
};
