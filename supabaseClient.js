import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://kofgxwcnkapibioedhrh.supabase.co';
export const SUPABASE_PUBLIC_KEY = 'https://kofgxwcnkapibioedhrh.supabase.co/rest/v1/';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_9FMsfEEp5dQd4f2vHt1u3A_amL3CsqM';
export const SUPABASE_STORAGE_BUCKET = 'app-files';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const signInWithGoogle = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      queryParams: {
        prompt: 'select_account',
      },
    },
  });

  if (error) throw error;
  return data;
};

export const signOutWithSupabase = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export default supabase;
