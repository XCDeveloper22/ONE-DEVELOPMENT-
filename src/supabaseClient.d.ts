import { SupabaseClient } from '@supabase/supabase-js';

export declare const SUPABASE_URL: string;
export declare const SUPABASE_PUBLIC_KEY: string;
export declare const SUPABASE_PUBLISHABLE_KEY: string;
export declare const SUPABASE_STORAGE_BUCKET: string;
export declare const PUBLIC_LIVE_DB_STORAGE_URL: string;
export declare const BACKEND_API_ORIGINS: string[];
export declare const supabase: SupabaseClient;
export declare const signInWithGoogle: () => Promise<any>;
export declare const signOutWithSupabase: () => Promise<void>;
export declare const uploadFileToSupabaseStorage: (params: {
  fileName: string;
  mimeType: string;
  base64DataUrl: string;
  folder?: string;
}) => Promise<string>;
export default supabase;
