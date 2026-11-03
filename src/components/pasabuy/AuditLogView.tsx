import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import { useApp } from '../../context/AppContext';
import { AuditLog, User } from '../../types';
import { logActivity } from '../../services/auditService';
import {
  ClipboardList,
  ShieldOff,
  Search,
  Filter,
  X,
  Users,
  UserPlus,
  Shield,
  Trash2,
  Lock,
  Eye,
  EyeOff,
  Calendar,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

// Helper: Format ISO timestamp nicely with date and time
function formatTimestamp(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// Helper: Badge color by action
function actionBadgeClass(action: string): string {
  switch (action.toUpperCase()) {
    case 'LOGIN':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'LOGOUT':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'ACCOUNT_CREATED':
      return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'CREATE_ORDER':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'COMPLETE_ORDER':
      return 'bg-teal-50 text-teal-700 border-teal-200';
    case 'CANCEL_ORDER':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'RECORD_PAYMENT':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    case 'ADD_EXPENSE':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200';
  }
}

export const AuditLogView: React.FC = () => {
  const { currentUser, setActiveView, addToast, sessionId, logout } = useApp();
  const [activeTab, setActiveTab] = useState<'logs' | 'users'>('logs');

  // Logs filters
  const [searchUser, setSearchUser] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Add User modal state
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newFullName, setNewFullName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newRole, setNewRole] = useState<'Admin' | 'Staff'>('Staff');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Access control
  if (currentUser?.role !== 'Admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
        <ShieldOff className="w-16 h-16 text-rose-400 opacity-60" />
        <h2 className="text-xl font-bold text-slate-700">Access Denied</h2>
        <p className="text-sm text-slate-500 max-w-xs">
          You do not have permission to view this section. It is restricted to Administrator accounts.
        </p>
        <button
          onClick={() => setActiveView('dashboard')}
          className="px-5 py-2 text-sm font-semibold rounded-xl bg-[#C90052] text-white hover:bg-[#b00048] transition-colors"
        >
          Go to Dashboard
        </button>
      </div>
    );
  }

  // Live query all audit logs ordered by newest first
  const allLogs = useLiveQuery(
    () => db.auditLogs.orderBy('timestamp').reverse().toArray(),
    []
  );

  // Live query all users
  const allUsers = useLiveQuery(
    () => db.users.toArray(),
    []
  );

  const adminCount = (allUsers || []).filter(u => u.role === 'Admin').length;

  // Distinct action types for filter dropdown
  const actionTypes = React.useMemo(() => {
    if (!allLogs) return [];
    const set = new Set(allLogs.map(l => l.action.toUpperCase()));
    return Array.from(set).sort();
  }, [allLogs]);

  // Apply filters to logs
  const filteredLogs: AuditLog[] = React.useMemo(() => {
    if (!allLogs) return [];
    return allLogs.filter(log => {
      if (
        searchUser &&
        !log.username.toLowerCase().includes(searchUser.toLowerCase()) &&
        !log.fullName.toLowerCase().includes(searchUser.toLowerCase())
      ) {
        return false;
      }
      if (filterAction && log.action.toUpperCase() !== filterAction) return false;
      if (filterDateFrom) {
        const logDate = log.timestamp.split('T')[0];
        if (logDate < filterDateFrom) return false;
      }
      if (filterDateTo) {
        const logDate = log.timestamp.split('T')[0];
        if (logDate > filterDateTo) return false;
      }
      return true;
    });
  }, [allLogs, searchUser, filterAction, filterDateFrom, filterDateTo]);

  const hasFilters = searchUser || filterAction || filterDateFrom || filterDateTo;

  const clearFilters = () => {
    setSearchUser('');
    setFilterAction('');
    setFilterDateFrom('');
    setFilterDateTo('');
  };

  // Create new user handler (from admin panel)
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFullName.trim() || !newUsername.trim() || !newPassword.trim()) {
      addToast('Please fill in all fields', 'error');
      return;
    }

    const cleanUsername = newUsername.trim().toLowerCase();
    const existing = await db.users.where('username').equals(cleanUsername).first();
    if (existing) {
      addToast(`Username "${cleanUsername}" is already taken`, 'error');
      return;
    }

    const newUserId = 'usr-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    const userToSave: User = {
      id: newUserId,
      username: cleanUsername,
      fullName: newFullName.trim(),
      role: newRole,
      isActive: true,
      password: newPassword
    };

    await db.users.add(userToSave);

    await logActivity(
      currentUser.id,
      currentUser.username,
      currentUser.fullName,
      currentUser.role,
      'ACCOUNT_CREATED',
      sessionId || 'sess-admin',
      `Admin created ${newRole} account for ${newFullName.trim()} (@${cleanUsername})`
    );

    addToast(`Created ${newRole} account: ${cleanUsername}`, 'success');
    setShowAddUserModal(false);
    setNewFullName('');
    setNewUsername('');
    setNewPassword('');
  };

  // Delete user handler
  const handleDeleteUser = async (user: User) => {
      const isSelf = user.id === currentUser.id;
      const adminCount = (allUsers || []).filter(u => u.role === 'Admin').length;

      if (isSelf) {
        if (adminCount <= 1) {
          addToast(
            'You cannot delete your own account because you are the only Admin. Please create or assign another Admin first.',
            'error'
          );
          return;
        }

        if (
          !confirm(
            `Are you sure you want to delete your own Admin account "${user.fullName}" (@${user.username})?\n\nAnother Admin exists. You will be logged out immediately.`
          )
        ) {
          return;
        }

        await db.users.delete(user.id);
        await logActivity(
          currentUser.id,
          currentUser.username,
          currentUser.fullName,
          currentUser.role,
          'ACCOUNT_DELETED',
          sessionId || 'sess-admin',
          `Admin deleted their own account: ${user.fullName} (@${user.username})`
        );

        addToast('Your Admin account was deleted. Logging out...', 'info');
        setTimeout(() => {
          logout();
        }, 700);
        return;
      }

      // Deleting another user
      if (!confirm(`Are you sure you want to delete user "${user.fullName}" (@${user.username})?`)) {
        return;
      }

      await db.users.delete(user.id);
      await logActivity(
        currentUser.id,
        currentUser.username,
        currentUser.fullName,
        currentUser.role,
        'ACCOUNT_DELETED',
        sessionId || 'sess-admin',
          `Admin deleted ${user.role} account: ${user.fullName} (@${user.username})`
      );
      addToast(`Deleted ${user.role} @${user.username}`, 'info');
    };

    return (
      <div className="space-y-5">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-100 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#C90052] to-[#FF0066] flex items-center justify-center shadow-xs">
              <ClipboardList className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">User Audit & Time Logs</h1>
              <p className="text-xs text-slate-500">
                Track who uses the system, login/logout times, dates, and actions performed
              </p>
            </div>
          </div>

          {/* Tab switchers */}
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-semibold">
              <button
                onClick={() => setActiveTab('logs')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${activeTab === 'logs'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                <ClipboardList className="w-3.5 h-3.5" />
                <span>Activity Logs ({filteredLogs.length})</span>
              </button>
              <button
                onClick={() => setActiveTab('users')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${activeTab === 'users'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Accounts ({allUsers?.length || 0})</span>
              </button>
            </div>

            {activeTab === 'users' && (
              <button
                onClick={() => setShowAddUserModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-[#C90052] hover:bg-[#b00048] rounded-xl shadow-xs transition-all active:scale-95"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>New Account</span>
              </button>
            )}
          </div>
        </div>

        {/* TAB 1: ACTIVITY LOGS */}
        {activeTab === 'logs' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <Filter className="w-3.5 h-3.5" />
                Filter Activities
                {hasFilters && (
                  <button
                    onClick={clearFilters}
                    className="ml-auto flex items-center gap-1 text-rose-500 hover:text-rose-700 font-semibold normal-case tracking-normal"
                  >
                    <X className="w-3 h-3" /> Clear filters
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {/* Search user */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={searchUser}
                    onChange={e => setSearchUser(e.target.value)}
                    placeholder="Filter by user or name..."
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-400 bg-slate-50"
                  />
                </div>

                {/* Action type */}
                <select
                  value={filterAction}
                  onChange={e => setFilterAction(e.target.value)}
                  className="px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-400 bg-slate-50"
                >
                  <option value="">All Action Types</option>
                  {actionTypes.map(a => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>

                {/* Date from */}
                <div className="relative">
                  <input
                    type="date"
                    value={filterDateFrom}
                    onChange={e => setFilterDateFrom(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-400 bg-slate-50"
                  />
                </div>

                {/* Date to */}
                <div className="relative">
                  <input
                    type="date"
                    value={filterDateTo}
                    onChange={e => setFilterDateTo(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-400 bg-slate-50"
                  />
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white border border-slate-100 rounded-2xl shadow-xs overflow-hidden">
              {allLogs === undefined ? (
                <div className="flex items-center justify-center py-16 text-slate-400 text-sm gap-3">
                  <div className="w-5 h-5 border-2 border-pink-400 border-t-transparent rounded-full animate-spin" />
                  Loading audit trail...
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                  <ClipboardList className="w-12 h-12 text-slate-200" />
                  <p className="text-sm font-semibold text-slate-600">No activity logs recorded yet</p>
                  <p className="text-xs text-slate-400">
                    {hasFilters
                      ? 'Try adjusting your filters.'
                      : 'System activity (logins, orders, payments, expenses) will appear here in real-time.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-600">
                        <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">Date & Time</th>
                        <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">User</th>
                        <th className="text-left px-4 py-3 font-semibold">Role</th>
                        <th className="text-left px-4 py-3 font-semibold">Action</th>
                        <th className="text-left px-4 py-3 font-semibold">What They Did</th>
                        <th className="text-left px-4 py-3 font-semibold whitespace-nowrap">Session ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredLogs.map(log => (
                        <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3 text-slate-700 whitespace-nowrap font-medium text-[11px]">
                            {formatTimestamp(log.timestamp)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-bold text-slate-900">@{log.username}</div>
                            <div className="text-[10px] text-slate-400">{log.fullName}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold text-[10px] ${log.role === 'Admin'
                                ? 'bg-pink-100 text-pink-700'
                                : 'bg-slate-100 text-slate-700'
                                }`}
                            >
                              {log.role === 'Admin' && <Shield className="w-3 h-3" />}
                              {log.role}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-lg border text-[10px] font-bold tracking-wide ${actionBadgeClass(
                                log.action
                              )}`}
                            >
                              {log.action}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600 max-w-[280px]">
                            {log.details || <span className="text-slate-300 italic">—</span>}
                          </td>
                          <td className="px-4 py-3 font-mono text-[10px] text-slate-400 whitespace-nowrap">
                            {log.sessionId}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: USER ACCOUNTS */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(allUsers || []).map(u => {
                const isSelf = u.id === currentUser.id;
                return (
                  <div
                    key={u.id}
                    className="bg-white border border-slate-100 rounded-2xl p-4 shadow-xs flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${u.role === 'Admin'
                                ? 'bg-pink-100 text-pink-700'
                                : 'bg-slate-100 text-slate-700'
                              }`}
                          >
                            {u.role === 'Admin' ? (
                              <Shield className="w-4 h-4" />
                            ) : (
                              <Users className="w-4 h-4" />
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                              <span>{u.fullName}</span>
                              {isSelf && (
                                <span className="text-[9px] bg-pink-100 text-pink-700 font-extrabold px-1.5 py-0.5 rounded-full">
                                  YOU
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400">@{u.username}</div>
                          </div>
                        </div>

                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${u.isActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                        >
                          {u.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>

                      <div className="pt-2 border-t border-slate-50 flex items-center justify-between text-xs text-slate-500">
                        <span>Role: <strong className="text-slate-700">{u.role}</strong></span>
                        <span className="text-[11px] text-slate-400">Password protected</span>
                      </div>
                    </div>

                <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between">
                  {isSelf ? (
                    adminCount > 1 ? (
                      <button
                        onClick={() => handleDeleteUser(u)}
                        className="text-xs text-rose-600 hover:text-rose-800 font-semibold flex items-center gap-1 transition-colors ml-auto bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-lg"
                        title="Delete your own Admin account (Another Admin exists)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete My Account</span>
                      </button>
                    ) : (
                      <span
                        className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md font-medium ml-auto"
                        title="You cannot delete yourself because you are the only Admin. Create another Admin first."
                      >
                        Only Admin (Cannot delete self)
                      </span>
                    )
                  ) : (
                    <button
                      onClick={() => handleDeleteUser(u)}
                      className="text-xs text-rose-600 hover:text-rose-800 font-semibold flex items-center gap-1 transition-colors ml-auto hover:bg-rose-50 px-2 py-1 rounded-lg"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Account</span>
                    </button>
                  )}
                </div>
                </div>
            );
            })}
          </div>
                </div>
    )
  }

  {/* Modal: Create User (Admin Only) */ }
  {
    showAddUserModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
        <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-pink-100 text-[#C90052] flex items-center justify-center font-bold">
                <UserPlus className="w-4 h-4" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Create Authorized User</h3>
            </div>
            <button
              onClick={() => setShowAddUserModal(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleCreateUser} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={newFullName}
                onChange={e => setNewFullName(e.target.value)}
                placeholder="e.g. John Doe"
                required
                className="w-full text-xs px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Username
              </label>
              <input
                type="text"
                value={newUsername}
                onChange={e => setNewUsername(e.target.value.toLowerCase())}
                placeholder="e.g. jdoe"
                required
                className="w-full text-xs px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Role Permission
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setNewRole('Admin')}
                  className={`p-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${newRole === 'Admin'
                    ? 'bg-pink-50 border-pink-500 text-pink-700'
                    : 'border-slate-200 text-slate-500'
                    }`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>Admin</span>
                </button>
                <button
                  type="button"
                  onClick={() => setNewRole('Staff')}
                  className={`p-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${newRole === 'Staff'
                    ? 'bg-pink-50 border-pink-500 text-pink-700'
                    : 'border-slate-200 text-slate-500'
                    }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Staff</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Enter user password"
                  required
                  className="w-full text-xs px-3.5 pr-10 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-400"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddUserModal(false)}
                className="flex-1 py-2 text-xs font-bold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2 text-xs font-bold rounded-xl bg-[#C90052] hover:bg-[#b00048] text-white shadow-xs"
              >
                Create User
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }
              </div >
            );
};
