import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import {
  Users,
  Search,
  Plus,
  Phone,
  MapPin,
  Edit2,
  Trash2,
  FileText
} from 'lucide-react';
import { Customer } from '../../types';

export const CustomersView: React.FC = () => {
  const { addToast } = useApp();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showModal, setShowModal] = useState<boolean>(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const [name, setName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const customers = useLiveQuery(() => db.customers.toArray(), []);
  const orders = useLiveQuery(() => db.orders.toArray(), []);

  const filteredCustomers = (customers || []).filter(c => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(q)) ||
      (c.address && c.address.toLowerCase().includes(q))
    );
  });

  const handleOpenAdd = () => {
    setEditingCustomer(null);
    setName('');
    setPhone('');
    setAddress('');
    setNotes('');
    setShowModal(true);
  };

  const handleOpenEdit = (c: Customer) => {
    setEditingCustomer(c);
    setName(c.name);
    setPhone(c.phone);
    setAddress(c.address);
    setNotes(c.notes || '');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      addToast('Customer name is required', 'error');
      return;
    }

    if (editingCustomer) {
      await db.customers.update(editingCustomer.id, {
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        notes: notes.trim()
      });
      addToast(`Updated "${name}"`, 'success');
    } else {
      const count = (customers?.length || 0) + 1;
      const code = `CUST-${String(count).padStart(3, '0')}`;
      const newCustomer: Customer = {
        id: 'c-' + Math.random().toString(36).substring(2, 9),
        code,
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        notes: notes.trim(),
        isActive: true,
        createdAt: new Date().toISOString()
      };
      await db.customers.add(newCustomer);
      addToast(`Customer "${name}" added`, 'success');
    }

    setShowModal(false);
  };

  const handleDelete = async (c: Customer) => {
    if (!confirm(`Are you sure you want to delete ${c.name}?`)) return;
    await db.customers.delete(c.id);
    addToast(`Deleted customer "${c.name}"`, 'info');
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-700" />
            <span>Customer Directory</span>
          </h2>
          <p className="text-xs text-slate-500">
            Client contacts, delivery addresses, notes, and order history in Antique.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#452B86] hover:bg-[#5B43E8] rounded-xl shadow-xs transition-all active:scale-95 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Customer</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-3.5 border border-slate-200/80 rounded-2xl shadow-xs">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by customer name, phone, code, or barangay..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
          />
        </div>
      </div>

      {/* Customer Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredCustomers.map(cust => {
          const custOrders = (orders || []).filter(o => o.customerId === cust.id);

          return (
            <div
              key={cust.id}
              className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs hover:border-purple-200 transition-all flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md">
                    {cust.code}
                  </span>
                  <span className="text-[11px] font-bold text-slate-500">
                    {custOrders.length} {custOrders.length === 1 ? 'Order' : 'Orders'}
                  </span>
                </div>

                <h3 className="text-sm font-bold text-slate-900">{cust.name}</h3>

                {cust.phone && (
                  <a
                    href={`tel:${cust.phone}`}
                    className="flex items-center gap-1.5 text-xs font-semibold text-purple-700 hover:text-purple-900"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>{cust.phone}</span>
                  </a>
                )}

                {cust.address && (
                  <div className="flex items-start gap-1.5 text-xs text-slate-600">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                    <span className="line-clamp-2">{cust.address}</span>
                  </div>
                )}

                {cust.notes && (
                  <div className="flex items-start gap-1.5 text-[11px] text-amber-800 bg-amber-50/70 p-2 rounded-xl">
                    <FileText className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                    <span className="line-clamp-2">{cust.notes}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-1 pt-3 mt-3 border-t border-slate-100">
                <button
                  onClick={() => handleOpenEdit(cust)}
                  className="p-1.5 text-slate-500 hover:text-purple-700 hover:bg-purple-50 rounded-lg"
                  title="Edit Customer"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(cust)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                  title="Delete Customer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit Customer Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-5 border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Maria Santos"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mobile Phone Number
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="e.g. 0917-888-1234"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Delivery Address & Landmark
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="e.g. Brgy. Funda-Dalipe, San Jose de Buenavista, Antique"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Client Notes / Delivery Preference
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. Call before delivery, gate is yellow, afternoon preferred"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
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
                {editingCustomer ? 'Save Changes' : 'Create Customer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
