import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb } from "@/integrations/db";
import { hashPassword, verifyPassword, signToken, verifyToken } from "@/lib/auth.server";
import { getRequestHeader } from "@tanstack/start-server-core";

// ── helpers ────────────────────────────────────────────────────────────────
function getBearerToken(): string | null {
  const auth = getRequestHeader("authorization") ?? getRequestHeader("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

async function getUserFromRequest(): Promise<{ id: string; email: string } | null> {
  const token = getBearerToken();
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  return { id: payload.sub, email: payload.email };
}

// ── login ──────────────────────────────────────────────────────────────────
export const loginFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ email: z.string().email(), password: z.string().min(1) }))
  .handler(async ({ data }) => {
    const sql = getDb();
    const email = data.email.trim().toLowerCase();

    const [user] = await sql<{ id: string; password_hash: string }[]>`
      SELECT id, password_hash FROM users WHERE lower(email) = ${email} LIMIT 1
    `;
    if (!user) return { ok: false, error: "Nieprawidłowy e-mail lub hasło." };

    const ok = await verifyPassword(data.password, user.password_hash);
    if (!ok) return { ok: false, error: "Nieprawidłowy e-mail lub hasło." };

    const token = await signToken({ sub: user.id, email });
    return { ok: true, token, userId: user.id };
  });

// ── register ───────────────────────────────────────────────────────────────
export const registerFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      email: z.string().email(),
      password: z.string().min(6),
      first_name: z.string().min(1),
      household_name: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const sql = getDb();
    const email = data.email.trim().toLowerCase();

    const [existing] = await sql`SELECT id FROM users WHERE lower(email) = ${email} LIMIT 1`;
    if (existing) return { ok: false, error: "Konto z tym adresem e-mail już istnieje." };

    const password_hash = await hashPassword(data.password);
    const householdName = data.household_name.trim();
    const firstName = data.first_name.trim();
    const displayName = firstName || email.split("@")[0];

    // Create user + profile + household + membership in one transaction
    await sql.begin(async (sql) => {
      const [user] = await sql<{ id: string }[]>`
        INSERT INTO users (email, password_hash) VALUES (${email}, ${password_hash}) RETURNING id
      `;
      await sql`
        INSERT INTO profiles (user_id, display_name, email, first_name)
        VALUES (${user.id}, ${displayName}, ${email}, ${firstName})
      `;
      const [hh] = await sql<{ id: string }[]>`
        INSERT INTO households (name, owner_id) VALUES (${householdName}, ${user.id}) RETURNING id
      `;
      await sql`
        INSERT INTO household_members (household_id, user_id, role, status, created_by)
        VALUES (${hh.id}, ${user.id}, 'owner', 'active', ${user.id})
      `;
    });

    return { ok: true, message: "Konto zostało utworzone. Możesz się zalogować." };
  });

// ── getMeFn — returns current user from JWT ────────────────────────────────
export const getMeFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await getUserFromRequest();
  if (!user) return { user: null };
  const sql = getDb();
  const [dbUser] = await sql<{ id: string; email: string }[]>`
    SELECT id, email FROM users WHERE id = ${user.id} LIMIT 1
  `;
  if (!dbUser) return { user: null };
  return { user: { id: dbUser.id, email: dbUser.email } };
});

// ── getBootstrapFn — single round-trip: user + profile + memberships ───────
export const getBootstrapFn = createServerFn({ method: "GET" }).handler(async () => {
  const t0 = Date.now();
  const user = await getUserFromRequest();
  if (!user) return { user: null, profile: null, memberships: [] };

  const sql = getDb();
  const [users, profiles, rows] = await Promise.all([
    sql<{ id: string; email: string }[]>`
      SELECT id, email FROM users WHERE id = ${user.id} LIMIT 1
    `,
    sql<{
      id: string;
      display_name: string | null;
      email: string | null;
      first_name: string | null;
      last_name: string | null;
      must_complete_profile: boolean;
      must_change_password: boolean;
    }[]>`
      SELECT id, display_name, email, first_name, last_name,
             must_complete_profile, must_change_password
      FROM profiles WHERE user_id = ${user.id} LIMIT 1
    `,
    sql<{ household_id: string; role: string; status: string; id: string; name: string; owner_id: string }[]>`
      SELECT hm.household_id, hm.role, hm.status, h.id, h.name, h.owner_id
      FROM household_members hm
      JOIN households h ON h.id = hm.household_id
      WHERE hm.user_id = ${user.id} AND hm.status = 'active'
    `,
  ]);

  if (!users[0]) return { user: null, profile: null, memberships: [] };
  console.log(`[perf] bootstrap DB queries: ${Date.now() - t0}ms`);

  return {
    user: { id: users[0].id, email: users[0].email },
    profile: profiles[0] ?? null,
    memberships: rows.map((r) => ({
      household_id: r.household_id,
      role: r.role,
      status: r.status,
      households: { id: r.id, name: r.name, owner_id: r.owner_id } as { id: string; name: string; owner_id: string } | null,
    })),
  };
});

// ── getMyProfileFn ─────────────────────────────────────────────────────────
export const getMyProfileFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ userId: z.string() }))
  .handler(async ({ data }) => {
    const sql = getDb();
    const [profile] = await sql<
      {
        id: string;
        display_name: string | null;
        email: string | null;
        first_name: string | null;
        last_name: string | null;
        must_complete_profile: boolean;
        must_change_password: boolean;
      }[]
    >`
      SELECT id, display_name, email, first_name, last_name, must_complete_profile, must_change_password
      FROM profiles WHERE user_id = ${data.userId} LIMIT 1
    `;
    return profile ?? null;
  });

// ── getMyHouseholdsFn ──────────────────────────────────────────────────────
export const getMyHouseholdsFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ userId: z.string() }))
  .handler(async ({ data }) => {
    const sql = getDb();
    const rows = await sql<
      {
        household_id: string;
        role: string;
        status: string;
        id: string;
        name: string;
        owner_id: string;
      }[]
    >`
      SELECT hm.household_id, hm.role, hm.status, h.id, h.name, h.owner_id
      FROM household_members hm
      JOIN households h ON h.id = hm.household_id
      WHERE hm.user_id = ${data.userId} AND hm.status = 'active'
    `;
    return rows.map((r) => ({
      household_id: r.household_id,
      role: r.role,
      status: r.status,
      households: { id: r.id, name: r.name, owner_id: r.owner_id },
    }));
  });

// ── updateProfileFn ────────────────────────────────────────────────────────
export const updateProfileFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      userId: z.string(),
      display_name: z.string().optional(),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      must_complete_profile: z.boolean().optional(),
      must_change_password: z.boolean().optional(),
      new_password: z.string().min(6).optional(),
      current_password: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const sql = getDb();

    // If changing password, verify current
    if (data.new_password) {
      const [user] = await sql<{ password_hash: string }[]>`
        SELECT password_hash FROM users WHERE id = ${data.userId}
      `;
      if (!user) return { ok: false, error: "Nie znaleziono użytkownika." };
      if (data.current_password) {
        const ok = await verifyPassword(data.current_password, user.password_hash);
        if (!ok) return { ok: false, error: "Aktualne hasło jest nieprawidłowe." };
      }
      const newHash = await hashPassword(data.new_password);
      await sql`UPDATE users SET password_hash = ${newHash}, updated_at = now() WHERE id = ${data.userId}`;
    }

    await sql`
      UPDATE profiles SET
        display_name = COALESCE(${data.display_name ?? null}, display_name),
        first_name = COALESCE(${data.first_name ?? null}, first_name),
        last_name = COALESCE(${data.last_name ?? null}, last_name),
        must_complete_profile = COALESCE(${data.must_complete_profile ?? null}, must_complete_profile),
        must_change_password = COALESCE(${data.must_change_password ?? null}, must_change_password),
        updated_at = now()
      WHERE user_id = ${data.userId}
    `;

    return { ok: true };
  });
