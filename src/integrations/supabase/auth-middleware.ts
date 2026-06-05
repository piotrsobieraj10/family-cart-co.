import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getSupabaseAdminClient } from "@/integrations/supabase/client.server";

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();
    const authHeader = request?.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized: No Bearer token");

    const token = authHeader.slice(7);
    const { data, error } = await getSupabaseAdminClient().auth.getUser(token);
    if (error || !data.user?.email) throw new Error("Unauthorized: Invalid token");

    return next({
      context: {
        userId: data.user.id,
        email: data.user.email,
        claims: data.user,
      },
    });
  },
);
