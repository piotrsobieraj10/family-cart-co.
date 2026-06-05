import { getRequestHeader } from "@tanstack/start-server-core";
import { getSupabaseAdminClient } from "@/integrations/supabase/client.server";

export type ServerUser = { id: string; email: string };

export function getBearerToken(): string | null {
  const auth = getRequestHeader("authorization") ?? getRequestHeader("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

export async function getUserFromRequest(): Promise<ServerUser | null> {
  const token = getBearerToken();
  if (!token) return null;

  const { data, error } = await getSupabaseAdminClient().auth.getUser(token);
  if (error || !data.user?.email) return null;
  return { id: data.user.id, email: data.user.email };
}

export async function requireUserFromRequest(): Promise<ServerUser> {
  const user = await getUserFromRequest();
  if (!user) throw new Error("Unauthorized");
  return user;
}
