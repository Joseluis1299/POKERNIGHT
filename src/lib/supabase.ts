import { createClient } from '@supabase/supabase-js';

import type { Database } from '../types/database';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'https://example.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'public-anon-key';

export const isSupabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
);

export const supabaseConfigError = isSupabaseConfigured
  ? null
  : 'Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para conectar PokerNight con tu proyecto de Supabase.';

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});
