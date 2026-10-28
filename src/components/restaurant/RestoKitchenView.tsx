import React from 'react';
import { useApp } from '../../context/AppContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import {
  ChefHat,
  Flame,
  CheckCircle,
  Clock,
  Check,
  Utensils
} from 'lucide-react';
import { RestoOrder, RestoOrderItem } from '../../types';

export const RestoKitchenView: React.FC = () => {
  const { addToast } = useApp();

  const openOrders = useLiveQuery(
    () => db.restoOrders.where('status').equals('Open').toArray(),
    []
  );

  const handleUpdateItemStatus = async (
    order: RestoOrder,
    itemIndex: number,
    newStatus: 'Pending' | 'Cooking' | 'Ready' | 'Served'
  ) => {
    const updatedItems = [...order.items];
    updatedItems[itemIndex] = {
      ...updatedItems[itemIndex],
      kitchenStatus: newStatus
    };

    await db.restoOrders.update(order.id, {
      items: updatedItems
    });

    addToast(`Item marked as ${newStatus}`, 'info');
  };

  const handleMarkAllReady = async (order: RestoOrder) => {
    const updatedItems = order.items.map(i => ({
      ...i,
      kitchenStatus: 'Ready' as const
    }));

    await db.restoOrders.update(order.id, {
      items: updatedItems
    });

    addToast(`All items for ${order.orderNo} marked Ready!`, 'success');
  };

  const getTimeElapsed = (dateString: string) => {
    const diffMs = new Date().getTime() - new Date(dateString).getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins <= 0) return 'Just now';
    return `${diffMins}m ago`;
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <ChefHat className="w-5 h-5 text-orange-600" />
            <span>Kitchen Display System (KDS)</span>
          </h2>
          <p className="text-xs text-slate-500">
            Live food tickets for head chef, grill masters, and kitchen crew.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 bg-white px-3 py-1.5 rounded-xl border border-slate-200">
          <Clock className="w-4 h-4 text-orange-600" />
          <span>Active Tickets: {openOrders?.length || 0}</span>
        </div>
      </div>

      {/* Tickets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {!openOrders || openOrders.length === 0 ? (
          <div className="col-span-full p-12 text-center bg-white border border-slate-200/80 rounded-2xl">
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-2 opacity-80" />
            <h3 className="text-sm font-bold text-slate-800">Kitchen is All Caught Up!</h3>
            <p className="text-xs text-slate-500 mt-1">
              No pending food tickets from dining tables or takeout orders.
            </p>
          </div>
        ) : (
          openOrders.map(order => {
            const allReady = order.items.every(
              i => i.kitchenStatus === 'Ready' || i.kitchenStatus === 'Served'
            );

            return (
              <div
                key={order.id}
                className={`bg-white border rounded-2xl shadow-xs overflow-hidden flex flex-col justify-between ${
                  allReady
                    ? 'border-emerald-300 ring-2 ring-emerald-200/40'
                    : 'border-slate-200 hover:border-orange-300'
                }`}
              >
                {/* Ticket Header */}
                <div
                  className={`p-3.5 border-b flex items-center justify-between ${
                    allReady
                      ? 'bg-emerald-50/70 border-emerald-100'
                      : 'bg-orange-50/50 border-orange-100'
                  }`}
                >
                  <div>
                    <span className="font-mono text-xs font-black text-slate-900">
                      {order.orderNo}
                    </span>
                    <h3 className="font-bold text-sm text-slate-900 mt-0.5">
                      {order.tableName || order.orderType}
                    </h3>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-bold text-orange-700 bg-orange-100/80 px-2 py-0.5 rounded-full block">
                      {getTimeElapsed(order.createdAt)}
                    </span>
                    <span className="text-[10px] text-slate-500 block mt-0.5 font-semibold">
                      {order.items.length} items
                    </span>
                  </div>
                </div>

                {/* Ticket Food Items */}
                <div className="p-3.5 space-y-2 flex-1">
                  {order.items.map((item, idx) => {
                    const isCooking = item.kitchenStatus === 'Cooking';
                    const isReady = item.kitchenStatus === 'Ready' || item.kitchenStatus === 'Served';

                    return (
                      <div
                        key={item.id}
                        className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 transition-all ${
                          isReady
                            ? 'bg-emerald-50/50 border-emerald-200 text-slate-600 line-through'
                            : isCooking
                            ? 'bg-amber-50/50 border-amber-300 text-amber-900 font-bold'
                            : 'bg-slate-50 border-slate-200 text-slate-800 font-semibold'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <span className="font-bold text-slate-900 mr-1.5">{item.qty}x</span>
                          <span>{item.name}</span>
                        </div>

                        {/* Status Switcher Button */}
                        <div className="flex items-center gap-1">
                          {!isReady && !isCooking && (
                            <button
                              onClick={() => handleUpdateItemStatus(order, idx, 'Cooking')}
                              className="px-2 py-1 text-[10px] font-bold bg-amber-200 hover:bg-amber-300 text-amber-900 rounded-lg flex items-center gap-1"
                            >
                              <Flame className="w-3 h-3" />
                              <span>Cook</span>
                            </button>
                          )}

                          {!isReady && (
                            <button
                              onClick={() => handleUpdateItemStatus(order, idx, 'Ready')}
                              className="px-2 py-1 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center gap-1"
                            >
                              <Check className="w-3 h-3" />
                              <span>Ready</span>
                            </button>
                          )}

                          {isReady && (
                            <span className="text-[10px] font-bold text-emerald-700 px-1.5 py-0.5 bg-emerald-100 rounded-md">
                              Done
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Ticket Bottom Footer */}
                <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-500">
                    {allReady ? 'Ready for serving!' : 'In kitchen preparation'}
                  </span>

                  {!allReady && (
                    <button
                      onClick={() => handleMarkAllReady(order)}
                      className="px-3 py-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-all active:scale-95"
                    >
                      All Ready
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
