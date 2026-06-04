// Supabase disabled — replaced by Replit PostgreSQL + custom JWT auth.
// This file is a stub to prevent accidental import errors.
export const supabaseAdmin = new Proxy({} as never, {
  get() {
    throw new Error("[client.server.ts] Supabase has been replaced with Replit PostgreSQL. Use src/integrations/db/index.ts instead.");
  },
});
