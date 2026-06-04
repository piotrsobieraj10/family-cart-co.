// Custom auth middleware — verifies JWT from Authorization header using our own secret.
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { verifyToken } from "@/lib/auth.server";

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();
    if (!request?.headers) throw new Error("Unauthorized: No request headers");

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized: No Bearer token");

    const token = authHeader.slice(7);
    const payload = await verifyToken(token);
    if (!payload) throw new Error("Unauthorized: Invalid token");

    return next({
      context: {
        userId: payload.sub,
        email: payload.email,
        claims: payload,
      },
    });
  },
);
