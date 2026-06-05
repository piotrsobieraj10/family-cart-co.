import { createMiddleware } from "@tanstack/react-start";
import { getAccessToken } from "@/lib/auth";

export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const token = await getAccessToken();
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);
