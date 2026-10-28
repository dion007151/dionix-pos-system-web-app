import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import {
  Receipt,
  Plus,
  Trash2,
  Calendar,
  Fuel,
  Wrench,
  DollarSign
} from 'lucide-react';
import { Expense } from '../../types';

export const ExpensesView: React.FC = () => {
  const { addToast } = useApp();

  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [showModal, setShowModal] = useState<boolean>(false);

  const [description, setDescription] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [category, setCategory] = useState<string>('Fuel');
  const [expenseDate, setExpenseDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [notes, setNotes] = useState<string>('');

  const expenses = useLiveQuery(() => db.expenses.orderBy('expenseDate').reverse().toArray(), []);

  const totalExpenseAmount = (expenses || []).reduce((sum, e) => sum + e.amount, 0);

  const filteredExpenses = (expenses || []).filter(e => {
    return selectedCategory === 'ALL' || e.category === selectedCategory;
  });

  const handleSave = async () => {
    if (!description.trim()) {
      addToast('Description is required', 'error');
      return;
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      addToast('Please enter a valid expense amount', 'error');
      return;
    }

    const newExpense: Expense = {
      id: 'e-' + Math.random().toString(36).substring(2, 9),
      description: description.trim(),
      amount: numAmount,
      category,
      expenseDate,
      notes: notes.trim() || undefined,
      createdAt: new Date().toISOString()
    };

    await db.expenses.add(newExpense);
    addToast(`Recorded expense: ₱${numAmount.toFixed(2)} (${category})`, 'success');
    setShowModal(false);
    setDescription('');
    setAmount('');
    setNotes('');
  };

  const handleDelete = async (e: Expense) => {
    if (!confirm(`Delete expense "${e.description}"?`)) return;
    await db.expenses.delete(e.id);
    addToast('Expense deleted', 'info');
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Receipt className="w-5 h-5 text-purple-700" />
            <span>Daily Operational Expenses</span>
          </h2>
          <p className="text-xs text-slate-500">
            Motorcycle fuel, mall parking, supplies, and maintenance in Antique.
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#452B86] hover:bg-[#5B43E8] rounded-xl shadow-xs transition-all active:scale-95 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Record Expense</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs">
          <span className="text-xs font-semibold text-slate-500">Total Operating Expenses</span>
          <div className="mt-1 text-2xl font-black text-rose-600">
            ₱{totalExpenseAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">Deducted from Pasabuy profits</p>
        </div>

        <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs">
          <span className="text-xs font-semibold text-slate-500">Recorded Receipts</span>
          <div className="mt-1 text-2xl font-black text-slate-900">
            {expenses?.length || 0}
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">Disbursements tracked</p>
        </div>

        <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs">
          <span className="text-xs font-semibold text-slate-500">Primary Category</span>
          <div className="mt-1 text-xl font-bold text-purple-700 flex items-center gap-2">
            <Fuel className="w-5 h-5" />
            <span>Rider Fuel</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">Shopping route gas allowances</p>
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-semibold no-scrollbar">
        {['ALL', 'Fuel', 'Supplies', 'Transportation', 'Maintenance', 'Other'].map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition-all ${
              selectedCategory === cat
                ? 'bg-[#452B86] text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {cat === 'ALL' ? 'All Categories' : cat}
          </button>
        ))}
      </div>

      {/* Expenses Table */}
      <div className="overflow-hidden bg-white border border-slate-200/80 rounded-2xl shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/75 text-[11px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100">
              <tr>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Description</th>
                <th className="px-5 py-3 text-right">Amount</th>
                <th className="px-5 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                    No expenses recorded in this category.
                  </td>
                </tr>
              ) : (
                filteredExpenses.map(exp => (
                  <tr key={exp.id} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3.5 font-mono text-slate-600">
                      {exp.expenseDate}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                        {exp.category}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-medium text-slate-900">
                      {exp.description}
                      {exp.notes && (
                        <span className="block text-[10px] text-slate-400 font-normal">
                          {exp.notes}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right font-black text-rose-600">
                      ₱{exp.amount.toFixed(2)}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <button
                        onClick={() => handleDelete(exp)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                        title="Delete Expense"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Expense Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-5 border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Record Operational Expense</h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description *
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="e.g. Motorcycle Gasoline (San Jose to Sibalom)"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Amount (₱) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-xs font-bold text-rose-600 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
                  >
                    <option value="Fuel">Fuel / Gasoline</option>
                    <option value="Supplies">Supplies (Receipt paper, bags)</option>
                    <option value="Transportation">Transportation & Parking</option>
                    <option value="Maintenance">Motorcycle Maintenance</option>
                    <option value="Other">Other Expenses</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
                <input
                  type="date"
                  value={expenseDate}
                  onChange={e => setExpenseDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. Full tank receipt OR#987"
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
                Save Expense
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
