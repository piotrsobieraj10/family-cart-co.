// Custom auth attacher — sends JWT from localStorage as Authorization header
// to all TanStack Start server function calls.
import { createMiddleware } from "@tanstack/react-start";
import { getStoredToken } from "@/lib/auth";

export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const token = getStoredToken();
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);
