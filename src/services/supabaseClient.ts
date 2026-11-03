import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export const DEFAULT_SUPABASE_URL = 'https://hgoylqrxgiypmfofbxzg.supabase.co';
export const DEFAULT_SUPABASE_KEY = 'sb_publishable_VdIwOrLH_Jep9M5VDr17mQ_anyKDOE8';

const STORAGE_KEY = 'antique_pasabuy_supabase_config';

export function getSavedSupabaseConfig(): SupabaseConfig | null {
  try {
    const envUrl = import.meta.env.VITE_SUPABASE_URL;
    const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (envUrl && envKey) {
      return { url: envUrl, anonKey: envKey };
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.url && parsed.anonKey) {
        return parsed;
      }
    }

    // Default configuration for automatic multi-device sync
    if (DEFAULT_SUPABASE_URL && DEFAULT_SUPABASE_KEY) {
      return { url: DEFAULT_SUPABASE_URL, anonKey: DEFAULT_SUPABASE_KEY };
    }
  } catch (err) {
    console.warn('Failed to read Supabase config:', err);
  }
  return null;
}

export function saveSupabaseConfig(url: string, anonKey: string): void {
  const cleanUrl = url.trim().replace(/\/$/, '');
  const cleanKey = anonKey.trim();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ url: cleanUrl, anonKey: cleanKey }));
  _client = null; // reset cached client
}

export function clearSupabaseConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
  _client = null;
}

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (_client) return _client;
  const config = getSavedSupabaseConfig();
  if (!config) return null;

  try {
    _client = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: false
      }
    });
    return _client;
  } catch (err) {
    console.error('Error creating Supabase client:', err);
    return null;
  }
}

export function isSupabaseConfigured(): boolean {
  return getSavedSupabaseConfig() !== null;
}

