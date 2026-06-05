import { createClient } from "@supabase/supabase-js";

const configuredUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const configuredAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!configuredUrl || !configuredAnonKey) {
  console.warn("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.");
}

const supabaseUrl = configuredUrl ?? "https://example.supabase.co";
const supabaseAnonKey = configuredAnonKey ?? "missing-anon-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
