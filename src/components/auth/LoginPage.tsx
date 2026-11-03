import React, { useState, useEffect } from 'react';
import { db } from '../../db/db';
import { logActivity } from '../../services/auditService';
import { User } from '../../types';
import {
  ShoppingBag,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  LogIn,
  UserPlus,
  Shield,
  AlertCircle,
  CheckCircle2,
  Store,
  Cloud,
  RefreshCw,
  X,
  Check
} from 'lucide-react';
import {
  isSupabaseConfigured,
  getSavedSupabaseConfig,
  saveSupabaseConfig,
  clearSupabaseConfig
} from '../../services/supabaseClient';
import {
  pullCloudUsersToLocal,
  pushLocalUsersToCloud,
  testSupabaseConnection
} from '../../services/cloudSync';

interface LoginPageProps {
  onLoginSuccess: (user: User, sessionId: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [hasCheckedExisting, setHasCheckedExisting] = useState(false);
  const [totalAccounts, setTotalAccounts] = useState<number | null>(null);

  // Sign In state
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Register state
  const [regFullName, setRegFullName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regRole, setRegRole] = useState<'Admin' | 'Staff'>('Admin');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);

  // Status feedback
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Cloud Sync Modal state for Multi-Device
  const [showCloudModal, setShowCloudModal] = useState(false);
  const [cloudUrl, setCloudUrl] = useState(() => getSavedSupabaseConfig()?.url || '');
  const [cloudKey, setCloudKey] = useState(() => getSavedSupabaseConfig()?.anonKey || '');
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Check if any accounts exist in database on startup
  useEffect(() => {
    async function checkUsers() {
      try {
        if (isSupabaseConfigured()) {
          try {
            await pullCloudUsersToLocal();
          } catch (e) {
            console.warn('Auto-pull from cloud on startup:', e);
          }
        }
        const count = await db.users.count();
        setTotalAccounts(count);
        if (count === 0) {
          setMode('register');
        } else {
          setMode('signin');
        }
      } catch (err) {
        console.error('Error querying users:', err);
      } finally {
        setHasCheckedExisting(true);
      }
    }
    checkUsers();
  }, []);

  const handleCloudSyncNow = async () => {
    if (!cloudUrl.trim() || !cloudKey.trim()) {
      setCloudStatus({ type: 'error', text: 'Please enter both Supabase URL and Anon Key.' });
      return;
    }

    setCloudSyncing(true);
    setCloudStatus(null);

    try {
      saveSupabaseConfig(cloudUrl.trim(), cloudKey.trim());
      const conn = await testSupabaseConnection();
      if (!conn.success) {
        setCloudStatus({ type: 'error', text: conn.message });
        return;
      }

      const pulled = await pullCloudUsersToLocal();
      const count = await db.users.count();
      setTotalAccounts(count);

      if (count > 0) {
        setMode('signin');
        setCloudStatus({
          type: 'success',
          text: `Success! Connected to cloud and pulled accounts. You can now sign in.`
        });
        setTimeout(() => {
          setShowCloudModal(false);
        }, 1200);
      } else {
        setCloudStatus({
          type: 'success',
          text: `Connected to Supabase! No existing accounts found in cloud yet. Once you create an admin account, it will sync automatically.`
        });
      }
    } catch (err: any) {
      setCloudStatus({ type: 'error', text: err.message || 'Failed to sync with cloud.' });
    } finally {
      setCloudSyncing(false);
    }
  };

  const switchMode = (newMode: 'signin' | 'register') => {
    setMode(newMode);
    setError('');
    setSuccessMsg('');
  };

  // Sign In Submission
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setIsLoading(true);

    try {
      const trimmedUser = loginUsername.trim().toLowerCase();
      if (!trimmedUser || !loginPassword.trim()) {
        setError('Please enter your username and password.');
        return;
      }

      const user = await db.users.where('username').equals(trimmedUser).first();

      if (!user) {
        setError('Invalid username or password.');
        return;
      }

      if (user.role !== 'Admin' && user.role !== 'Staff') {
        setError('Access restricted to Admin and Staff accounts only.');
        return;
      }

      if (!user.isActive) {
        setError('This account is disabled. Please contact your administrator.');
        return;
      }

      if (user.password !== loginPassword) {
        setError('Invalid username or password.');
        return;
      }

      const sessionId = 'sess-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);

      await logActivity(
        user.id,
        user.username,
        user.fullName,
        user.role,
        'LOGIN',
        sessionId,
        'User logged in to POS'
      );

      // Background push if Supabase is connected
      if (isSupabaseConfigured()) {
        pushLocalUsersToCloud().catch(err => console.warn('Cloud sync on login:', err));
      }

      onLoginSuccess(user, sessionId);
    } catch (err) {
      console.error('Login error:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Account Registration Submission
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setIsLoading(true);

    try {
      const cleanFullName = regFullName.trim();
      const cleanUsername = regUsername.trim().toLowerCase();

      if (!cleanFullName) {
        setError('Full name is required.');
        return;
      }

      if (!cleanUsername) {
        setError('Username is required.');
        return;
      }

      if (cleanUsername.length < 3) {
        setError('Username must be at least 3 characters.');
        return;
      }

      if (!/^[a-zA-Z0-9_.-]+$/.test(cleanUsername)) {
        setError('Username can only contain letters, numbers, hyphens, and underscores.');
        return;
      }

      if (regRole !== 'Admin' && regRole !== 'Staff') {
        setError('Only Admin and Staff roles are permitted.');
        return;
      }

      if (!regPassword) {
        setError('Password is required.');
        return;
      }

      if (regPassword.length < 4) {
        setError('Password must be at least 4 characters long.');
        return;
      }

      if (regPassword !== regConfirmPassword) {
        setError('Passwords do not match.');
        return;
      }

      const existing = await db.users.where('username').equals(cleanUsername).first();
      if (existing) {
        setError(`Username "${cleanUsername}" is already taken.`);
        return;
      }

      const newUserId = 'usr-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
      const sessionId = 'sess-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);

      const newUser: User = {
        id: newUserId,
        username: cleanUsername,
        fullName: cleanFullName,
        role: regRole,
        isActive: true,
        password: regPassword
      };

      await db.users.add(newUser);

      // Push to Supabase if configured so other devices receive this account immediately
      if (isSupabaseConfigured()) {
        try {
          await pushLocalUsersToCloud();
        } catch (cloudErr) {
          console.warn('Could not push new user to Supabase:', cloudErr);
        }
      }

      await logActivity(
        newUser.id,
        newUser.username,
        newUser.fullName,
        newUser.role,
        'ACCOUNT_CREATED',
        sessionId,
        `Created new ${regRole} account: ${cleanFullName} (@${cleanUsername})`
      );

      await logActivity(
        newUser.id,
        newUser.username,
        newUser.fullName,
        newUser.role,
        'LOGIN',
        sessionId,
        'Initial login following account creation'
      );

      setSuccessMsg(`Welcome, ${cleanFullName}! Preparing your workspace...`);

      setTimeout(() => {
        onLoginSuccess(newUser, sessionId);
      }, 400);
    } catch (err) {
      console.error('Account creation error:', err);
      setError('Failed to create account. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFF7FA] flex items-center justify-center p-4 sm:p-6 text-[#2B1720]">
      <div className="w-full max-w-[420px]">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#C90052] text-white shadow-xs mb-3">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#2B1720]">
            Antique Pasabuy POS
          </h1>
          <p className="text-xs text-[#78636C] mt-0.5">
            Sign in to manage orders and sales
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl border border-[#F2D5E0] shadow-[0_8px_30px_rgb(43,23,32,0.06)] p-6 sm:p-7">
          {/* First-time alert when no accounts exist */}
          {hasCheckedExisting && totalAccounts === 0 && (
            <div className="mb-5 p-3 rounded-xl bg-[#FFF2F6] border border-[#F7C6D6] text-xs text-[#9E1B46] flex items-start gap-2.5">
              <Shield className="w-4 h-4 shrink-0 mt-0.5 text-[#C90052]" />
              <div>
                <span className="font-bold">Initial Setup:</span> Create your first administrator account below to access the POS system.
              </div>
            </div>
          )}

          {/* Mode Switcher */}
          <div className="flex bg-[#FBF1F5] p-1 rounded-xl mb-5 border border-[#F0D5E0]">
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all duration-140 ${mode === 'signin'
                ? 'bg-white text-[#2B1720] shadow-xs font-bold border border-[#EACBD7]'
                : 'text-[#78636C] hover:text-[#2B1720]'
                }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all duration-140 ${mode === 'register'
                ? 'bg-white text-[#2B1720] shadow-xs font-bold border border-[#EACBD7]'
                : 'text-[#78636C] hover:text-[#2B1720]'
                }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Create Account</span>
            </button>
          </div>

          {/* SIGN IN FORM */}
          {mode === 'signin' && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#451C2C] mb-1.5">
                  Username
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9E8691] pointer-events-none" />
                  <input
                    type="text"
                    value={loginUsername}
                    onChange={e => setLoginUsername(e.target.value)}
                    placeholder="Enter your username"
                    autoComplete="username"
                    autoFocus
                    required
                    className="w-full bg-white border border-[#E8D2DC] text-[#2B1720] placeholder-[#A58F9A] text-xs rounded-xl pl-9 pr-3 py-2.5 focus-visible:outline-none focus-visible:border-[#C90052] focus-visible:ring-2 focus-visible:ring-[#C90052]/20 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#451C2C] mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9E8691] pointer-events-none" />
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                    className="w-full bg-white border border-[#E8D2DC] text-[#2B1720] placeholder-[#A58F9A] text-xs rounded-xl pl-9 pr-10 py-2.5 focus-visible:outline-none focus-visible:border-[#C90052] focus-visible:ring-2 focus-visible:ring-[#C90052]/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9E8691] hover:text-[#2B1720] p-1 rounded-md transition-colors"
                    aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                  >
                    {showLoginPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-[#FFF1F4] border border-[#FCD2DC] text-[#A81740] text-xs flex items-start gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#C90052]" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-[#C90052] hover:bg-[#B5004A] text-white text-xs font-bold rounded-xl shadow-xs transition-all duration-140 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none mt-1"
              >
                {isLoading ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <LogIn className="w-4 h-4" />
                )}
                <span>{isLoading ? 'Signing in...' : 'Sign In'}</span>
              </button>
            </form>
          )}

          {/* CREATE ACCOUNT FORM */}
          {mode === 'register' && (
            <form onSubmit={handleCreateAccount} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#451C2C] mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={regFullName}
                  onChange={e => setRegFullName(e.target.value)}
                  placeholder="e.g. Maria Santos"
                  autoFocus
                  required
                  className="w-full bg-white border border-[#E8D2DC] text-[#2B1720] placeholder-[#A58F9A] text-xs rounded-xl px-3 py-2 focus-visible:outline-none focus-visible:border-[#C90052] focus-visible:ring-2 focus-visible:ring-[#C90052]/20 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#451C2C] mb-1">
                  Username
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9E8691] text-xs font-mono">
                    @
                  </span>
                  <input
                    type="text"
                    value={regUsername}
                    onChange={e => setRegUsername(e.target.value.toLowerCase())}
                    placeholder="username"
                    autoComplete="username"
                    required
                    className="w-full bg-white border border-[#E8D2DC] text-[#2B1720] placeholder-[#A58F9A] text-xs rounded-xl pl-7 pr-3 py-2 focus-visible:outline-none focus-visible:border-[#C90052] focus-visible:ring-2 focus-visible:ring-[#C90052]/20 transition-all font-mono"
                  />
                </div>
              </div>

              {/* Role Selection */}
              <div>
                <label className="block text-xs font-semibold text-[#451C2C] mb-1">
                  Role Permission
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRegRole('Admin')}
                    className={`p-2.5 rounded-xl border text-left transition-all duration-140 ${regRole === 'Admin'
                      ? 'border-[#C90052] bg-[#FFF2F6] text-[#2B1720] ring-1 ring-[#C90052]'
                      : 'border-[#E8D2DC] bg-white text-[#78636C] hover:border-[#D4BCC8]'
                      }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-[#2B1720]">
                      <Shield className="w-3.5 h-3.5 text-[#C90052]" />
                      <span>Admin</span>
                    </div>
                    <p className="text-[10px] text-[#78636C] mt-0.5 leading-snug">
                      Full access, user manager & logs
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRegRole('Staff')}
                    className={`p-2.5 rounded-xl border text-left transition-all duration-140 ${regRole === 'Staff'
                      ? 'border-[#C90052] bg-[#FFF2F6] text-[#2B1720] ring-1 ring-[#C90052]'
                      : 'border-[#E8D2DC] bg-white text-[#78636C] hover:border-[#D4BCC8]'
                      }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold text-xs text-[#2B1720]">
                      <Store className="w-3.5 h-3.5 text-[#C90052]" />
                      <span>Staff</span>
                    </div>
                    <p className="text-[10px] text-[#78636C] mt-0.5 leading-snug">
                      Orders, cashiering & buying list
                    </p>
                  </button>
                </div>
              </div>

              {/* Passwords */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-[#451C2C] mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showRegPassword ? 'text' : 'password'}
                      value={regPassword}
                      onChange={e => setRegPassword(e.target.value)}
                      placeholder="Min. 4 chars"
                      required
                      className="w-full bg-white border border-[#E8D2DC] text-[#2B1720] placeholder-[#A58F9A] text-xs rounded-xl pl-3 pr-8 py-2 focus-visible:outline-none focus-visible:border-[#C90052] focus-visible:ring-2 focus-visible:ring-[#C90052]/20 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9E8691] hover:text-[#2B1720] p-0.5 rounded"
                      aria-label={showRegPassword ? 'Hide password' : 'Show password'}
                    >
                      {showRegPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#451C2C] mb-1">
                    Confirm
                  </label>
                  <div className="relative">
                    <input
                      type={showRegConfirmPassword ? 'text' : 'password'}
                      value={regConfirmPassword}
                      onChange={e => setRegConfirmPassword(e.target.value)}
                      placeholder="Repeat"
                      required
                      className="w-full bg-white border border-[#E8D2DC] text-[#2B1720] placeholder-[#A58F9A] text-xs rounded-xl pl-3 pr-8 py-2 focus-visible:outline-none focus-visible:border-[#C90052] focus-visible:ring-2 focus-visible:ring-[#C90052]/20 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegConfirmPassword(v => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9E8691] hover:text-[#2B1720] p-0.5 rounded"
                      aria-label={showRegConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showRegConfirmPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-[#FFF1F4] border border-[#FCD2DC] text-[#A81740] text-xs flex items-start gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#C90052]" />
                  <span>{error}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] text-[#166534] text-xs flex items-start gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#16A34A]" />
                  <span>{successMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-[#C90052] hover:bg-[#B5004A] text-white text-xs font-bold rounded-xl shadow-xs transition-all duration-140 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none mt-1"
              >
                {isLoading ? (
                  <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <UserPlus className="w-4 h-4" />
                )}
                <span>{isLoading ? 'Creating Account...' : `Register ${regRole} Account`}</span>
              </button>
            </form>
          )}

          {/* Switch link */}
          <div className="mt-5 pt-4 border-t border-[#F5E6EC] text-center">
            {mode === 'signin' ? (
              <p className="text-xs text-[#78636C]">
                Need to add a staff or admin?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className="font-bold text-[#C90052] hover:text-[#A60043] transition-colors"
                >
                  Create Account
                </button>
              </p>
            ) : (
              <p className="text-xs text-[#78636C]">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className="font-bold text-[#C90052] hover:text-[#A60043] transition-colors"
                >
                  Sign In
                </button>
              </p>
            )}
          </div>
        </div>

        {/* Multi-Device Cloud Sync Link */}
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => setShowCloudModal(true)}
            className="inline-flex items-center gap-1.5 text-xs text-[#78636C] hover:text-[#C90052] font-medium transition-colors p-1"
          >
            <Cloud className="w-3.5 h-3.5 text-[#C90052]" />
            <span>
              {isSupabaseConfigured()
                ? '☁ Cloud Synced (Phone & PC Connected)'
                : '☁ Connect Phone to PC / Cloud Sync'}
            </span>
          </button>
        </div>
      </div>

      {/* Cloud Sync Setup Modal */}
      {showCloudModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 border border-[#E8D2DC] space-y-4">
            <div className="flex items-center justify-between border-b border-[#F5E6EC] pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-[#FFF1F4] rounded-xl text-[#C90052]">
                  <Cloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#2B1720]">Connect Phone & PC</h3>
                  <p className="text-[11px] text-[#78636C]">Supabase Cloud Sync</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCloudModal(false)}
                className="text-[#9E8691] hover:text-[#2B1720] p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[#78636C] leading-relaxed">
              Enter your Supabase project credentials to share your admin account and orders between your laptop, phone, and tablet.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#451C2C] mb-1">
                  Supabase Project URL
                </label>
                <input
                  type="text"
                  value={cloudUrl}
                  onChange={e => setCloudUrl(e.target.value)}
                  placeholder="https://xyzcompany.supabase.co"
                  className="w-full bg-[#FFF7FA] border border-[#E8D2DC] text-[#2B1720] placeholder-[#A58F9A] text-xs rounded-xl px-3 py-2.5 focus-visible:outline-none focus-visible:border-[#C90052]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#451C2C] mb-1">
                  Supabase Anon Key
                </label>
                <textarea
                  rows={2}
                  value={cloudKey}
                  onChange={e => setCloudKey(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  className="w-full bg-[#FFF7FA] border border-[#E8D2DC] text-[#2B1720] placeholder-[#A58F9A] text-xs rounded-xl px-3 py-2 focus-visible:outline-none focus-visible:border-[#C90052] font-mono resize-none"
                />
              </div>
            </div>

            {cloudStatus && (
              <div
                className={`p-3 rounded-xl text-xs flex items-start gap-2 font-medium ${
                  cloudStatus.type === 'success'
                    ? 'bg-[#F0FDF4] border border-[#BBF7D0] text-[#166534]'
                    : 'bg-[#FFF1F4] border border-[#FCD2DC] text-[#A81740]'
                }`}
              >
                {cloudStatus.type === 'success' ? (
                  <Check className="w-4 h-4 shrink-0 mt-0.5 text-[#16A34A]" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#C90052]" />
                )}
                <span className="leading-relaxed">{cloudStatus.text}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#F5E6EC]">
              <button
                type="button"
                onClick={() => setShowCloudModal(false)}
                className="px-3 py-2 text-xs font-bold text-[#78636C] hover:bg-slate-100 rounded-xl"
              >
                Close
              </button>
              <button
                type="button"
                disabled={cloudSyncing}
                onClick={handleCloudSyncNow}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#C90052] hover:bg-[#B5004A] rounded-xl shadow-xs transition-all disabled:opacity-50"
              >
                {cloudSyncing ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Cloud className="w-3.5 h-3.5" />
                )}
                <span>{cloudSyncing ? 'Connecting...' : 'Connect & Pull Accounts'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
