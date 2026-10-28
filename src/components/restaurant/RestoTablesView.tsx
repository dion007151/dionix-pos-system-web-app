import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import {
  Grid,
  Plus,
  Users,
  CheckCircle,
  AlertCircle,
  Clock,
  RotateCcw
} from 'lucide-react';
import { RestoTable, RestoTableStatus } from '../../types';

export const RestoTablesView: React.FC = () => {
  const { addToast, setActiveView } = useApp();

  const tables = useLiveQuery(() => db.restoTables.toArray(), []);
  const activeOrders = useLiveQuery(
    () => db.restoOrders.where('status').equals('Open').toArray(),
    []
  );

  const [selectedSection, setSelectedSection] = useState<string>('ALL');

  const sections = Array.from(
    new Set((tables || []).map(t => t.section).filter(Boolean))
  );

  const filteredTables = (tables || []).filter(
    t => selectedSection === 'ALL' || t.section === selectedSection
  );

  const handleUpdateStatus = async (table: RestoTable, newStatus: RestoTableStatus) => {
    await db.restoTables.update(table.id, {
      status: newStatus,
      currentOrderId: newStatus === 'Available' ? undefined : table.currentOrderId
    });
    addToast(`${table.name} set to ${newStatus}`, 'info');
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Grid className="w-5 h-5 text-[#8B5E5E]" />
            <span>Dining Table Floor Plan</span>
          </h2>
          <p className="text-xs text-slate-500">
            Real-time occupancy status across Main Dining, Bar Counter, VIP, and Patio.
          </p>
        </div>

        {/* Section Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
          <button
            onClick={() => setSelectedSection('ALL')}
            className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all ${
              selectedSection === 'ALL'
                ? 'bg-[#291818] text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            All Sections
          </button>
          {sections.map(s => (
            <button
              key={s}
              onClick={() => setSelectedSection(s)}
              className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-all ${
                selectedSection === s
                  ? 'bg-[#291818] text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Tables Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredTables.map(table => {
          const isOccupied = table.status === 'Occupied';
          const isAvailable = table.status === 'Available';
          const isBilled = table.status === 'Billed';

          const currentOrder = (activeOrders || []).find(
            o => o.id === table.currentOrderId || o.tableId === table.id
          );

          return (
            <div
              key={table.id}
              className={`p-4 bg-white border rounded-2xl shadow-xs transition-all flex flex-col justify-between h-44 ${
                isOccupied
                  ? 'border-rose-300 ring-2 ring-rose-200/50 bg-rose-50/10'
                  : isBilled
                  ? 'border-amber-300 ring-2 ring-amber-200/50 bg-amber-50/10'
                  : 'border-slate-200 hover:border-slate-400'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                    {table.tableNumber}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                      isAvailable
                        ? 'bg-emerald-100 text-emerald-800'
                        : isOccupied
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {table.status}
                  </span>
                </div>

                <h3 className="font-bold text-sm text-slate-900 mt-2">{table.name}</h3>

                <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                  <Users className="w-3.5 h-3.5" />
                  <span>Seats {table.capacity} guests · {table.section}</span>
                </div>

                {currentOrder && (
                  <div className="mt-2 text-[11px] font-semibold text-rose-700 bg-rose-50 p-1.5 rounded-lg truncate">
                    {currentOrder.orderNo} · ₱{currentOrder.total.toFixed(2)}
                  </div>
                )}
              </div>

              {/* Quick Actions */}
              <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100">
                {isAvailable ? (
                  <button
                    onClick={() => handleUpdateStatus(table, 'Occupied')}
                    className="flex-1 py-1.5 text-xs font-bold text-white bg-[#291818] rounded-xl hover:bg-[#4A2C2C] shadow-xs"
                  >
                    Occupy
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => handleUpdateStatus(table, 'Available')}
                      className="flex-1 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 rounded-xl"
                    >
                      Clear Table
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(table, 'Billed')}
                      className="px-2.5 py-1.5 text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-xl"
                    >
                      Bill-Out
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
