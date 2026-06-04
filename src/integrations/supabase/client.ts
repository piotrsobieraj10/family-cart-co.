// Supabase disabled — replaced by Replit PostgreSQL + custom JWT auth.
// This file is a stub to prevent accidental import errors.
export const supabase = new Proxy({} as never, {
  get() {
    throw new Error("[client.ts] Supabase has been replaced with Replit PostgreSQL. Use server functions from src/lib/api/data.functions.ts instead.");
  },
});
