import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getDb } from "@/integrations/db";
import { getRequestHeader } from "@tanstack/start-server-core";
import { verifyToken } from "@/lib/auth.server";

// ── auth helper ────────────────────────────────────────────────────────────
async function requireUser(): Promise<{ id: string; email: string }> {
  const auth = getRequestHeader("authorization") ?? getRequestHeader("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("Unauthorized");
  const payload = await verifyToken(token);
  if (!payload) throw new Error("Unauthorized: invalid token");
  return { id: payload.sub, email: payload.email };
}

async function requireHouseholdMember(userId: string, householdId: string, adminOnly = false) {
  const sql = getDb();
  const [m] = await sql<{ role: string }[]>`
    SELECT role FROM household_members
    WHERE user_id = ${userId} AND household_id = ${householdId} AND status = 'active' LIMIT 1
  `;
  if (!m) throw new Error("Forbidden: not a member");
  if (adminOnly && !["owner", "admin"].includes(m.role)) throw new Error("Forbidden: not an admin");
  return m;
}

// ── HOUSEHOLDS ─────────────────────────────────────────────────────────────
export const getHouseholdFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ householdId: z.string() }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    await requireHouseholdMember(user.id, data.householdId);
    const sql = getDb();
    const [hh] = await sql<{ id: string; name: string; owner_id: string }[]>`
      SELECT id, name, owner_id FROM households WHERE id = ${data.householdId}
    `;
    return hh ?? null;
  });

export const createHouseholdFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ name: z.string().min(1) }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const sql = getDb();
    const [hh] = await sql<{ id: string }[]>`
      INSERT INTO households (name, owner_id) VALUES (${data.name.trim()}, ${user.id}) RETURNING id
    `;
    await sql`
      INSERT INTO household_members (household_id, user_id, role, status, created_by)
      VALUES (${hh.id}, ${user.id}, 'owner', 'active', ${user.id})
    `;
    return { id: hh.id };
  });

// ── HOUSEHOLD MEMBERS ──────────────────────────────────────────────────────
export const getHouseholdMembersFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ householdId: z.string() }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    await requireHouseholdMember(user.id, data.householdId);
    const sql = getDb();
    const rows = await sql<{
      id: string; user_id: string; role: string; status: string; label: string | null;
      display_name: string | null; email: string | null;
    }[]>`
      SELECT hm.id, hm.user_id, hm.role, hm.status, hm.label,
             p.display_name, p.email
      FROM household_members hm
      LEFT JOIN profiles p ON p.user_id = hm.user_id
      WHERE hm.household_id = ${data.householdId} AND hm.status = 'active'
      ORDER BY hm.created_at
    `;
    return rows;
  });

export const removeMemberFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ householdId: z.string(), memberId: z.string() }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    await requireHouseholdMember(user.id, data.householdId, true);
    const sql = getDb();
    await sql`
      UPDATE household_members SET status = 'removed'
      WHERE id = ${data.memberId} AND household_id = ${data.householdId}
    `;
    return { ok: true };
  });

export const addHouseholdMemberFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    household_id: z.string(),
    email: z.string().email(),
    temporary_password: z.string().optional().default(""),
    role: z.enum(["admin", "member", "viewer"]),
    label: z.string().nullable().optional(),
  }))
  .handler(async ({ data }) => {
    const caller = await requireUser();
    const sql = getDb();
    await requireHouseholdMember(caller.id, data.household_id, true);

    const email = data.email.trim().toLowerCase();

    // Find existing user
    const [existingUser] = await sql<{ id: string }[]>`
      SELECT id FROM users WHERE lower(email) = ${email} LIMIT 1
    `;

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;
    } else {
      if (!data.temporary_password || data.temporary_password.length < 6) {
        return { ok: false, code: "temporary_password_required", error: "Ten e-mail nie istnieje w systemie. Podaj hasło tymczasowe (min. 6 znaków)." };
      }
      const { hashPassword } = await import("@/lib/auth.server");
      const hash = await hashPassword(data.temporary_password);
      const [newUser] = await sql<{ id: string }[]>`
        INSERT INTO users (email, password_hash) VALUES (${email}, ${hash}) RETURNING id
      `;
      await sql`
        INSERT INTO profiles (user_id, email, display_name, must_complete_profile, must_change_password)
        VALUES (${newUser.id}, ${email}, ${email.split("@")[0]}, true, true)
      `;
      userId = newUser.id;
    }

    // Check existing membership
    const [existing] = await sql<{ id: string; status: string }[]>`
      SELECT id, status FROM household_members
      WHERE household_id = ${data.household_id} AND user_id = ${userId} LIMIT 1
    `;

    if (existing?.status === "active") {
      return { ok: true, code: "already_member", created: false, user_id: userId };
    }

    if (existing) {
      await sql`
        UPDATE household_members SET role = ${data.role}, status = 'active', label = ${data.label ?? null}
        WHERE id = ${existing.id}
      `;
    } else {
      await sql`
        INSERT INTO household_members (household_id, user_id, role, status, created_by, label)
        VALUES (${data.household_id}, ${userId}, ${data.role}, 'active', ${caller.id}, ${data.label ?? null})
      `;
    }

    return { ok: true, created: !existingUser, user_id: userId };
  });

// ── STORES ─────────────────────────────────────────────────────────────────
export const getStoresFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ householdId: z.string() }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    await requireHouseholdMember(user.id, data.householdId);
    const sql = getDb();
    return sql<{ id: string; name: string; normalized_name: string }[]>`
      SELECT id, name, normalized_name FROM stores
      WHERE household_id = ${data.householdId}
      ORDER BY name
    `;
  });

export const createStoreFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ householdId: z.string(), name: z.string().min(1) }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    await requireHouseholdMember(user.id, data.householdId);
    const sql = getDb();
    const name = data.name.trim();
    const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const [store] = await sql<{ id: string }[]>`
      INSERT INTO stores (household_id, name, normalized_name, created_by)
      VALUES (${data.householdId}, ${name}, ${normalized}, ${user.id})
      ON CONFLICT (household_id, normalized_name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `;
    return { id: store.id, name };
  });

export const deleteStoreFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ storeId: z.string(), householdId: z.string() }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    await requireHouseholdMember(user.id, data.householdId, true);
    const sql = getDb();
    await sql`DELETE FROM stores WHERE id = ${data.storeId} AND household_id = ${data.householdId}`;
    return { ok: true };
  });

// ── SHOPPING LISTS ─────────────────────────────────────────────────────────
export const getActiveListFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ householdId: z.string() }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    await requireHouseholdMember(user.id, data.householdId);
    const sql = getDb();
    const [list] = await sql<{
      id: string; status: string; default_store_id: string | null;
      budget_amount: number | null; estimated_total: number | null; actual_total: number | null;
    }[]>`
      SELECT id, status, default_store_id, budget_amount, estimated_total, actual_total
      FROM shopping_lists
      WHERE household_id = ${data.householdId}
        AND status IN ('active', 'shopping', 'partially_done')
      ORDER BY created_at DESC LIMIT 1
    `;
    return list ?? null;
  });

export const ensureActiveListFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ householdId: z.string() }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    await requireHouseholdMember(user.id, data.householdId);
    const sql = getDb();

    const [existing] = await sql<{ id: string; status: string }[]>`
      SELECT id, status FROM shopping_lists
      WHERE household_id = ${data.householdId}
        AND status IN ('active', 'shopping', 'partially_done')
      ORDER BY created_at DESC LIMIT 1
    `;
    if (existing) return existing;

    const [list] = await sql<{ id: string; status: string }[]>`
      INSERT INTO shopping_lists (household_id, created_by, name, status)
      VALUES (${data.householdId}, ${user.id}, 'Lista zakupów', 'active')
      RETURNING id, status
    `;
    return list;
  });

// ── SHOPPING ITEMS ─────────────────────────────────────────────────────────
export const getShoppingItemsFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ listId: z.string(), householdId: z.string() }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    await requireHouseholdMember(user.id, data.householdId);
    const sql = getDb();
    return sql<{
      id: string; name: string; category: string | null; quantity: number | null;
      unit: string | null; note: string | null; status: string; store_id: string | null;
      estimated_unit_price: number | null; created_by: string | null; bought_by: string | null; bought_at: string | null;
    }[]>`
      SELECT id, name, category, quantity, unit, note, status, store_id,
             estimated_unit_price, created_by, bought_by, bought_at
      FROM shopping_items
      WHERE list_id = ${data.listId} AND status != 'deleted'
      ORDER BY created_at
    `;
  });

export const addItemFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    listId: z.string(),
    householdId: z.string(),
    name: z.string().min(1),
    category: z.string().nullable().optional(),
    quantity: z.number().nullable().optional(),
    unit: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
    store_id: z.string().nullable().optional(),
    estimated_unit_price: z.number().nullable().optional(),
  }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    await requireHouseholdMember(user.id, data.householdId);
    const sql = getDb();
    const [item] = await sql<{ id: string }[]>`
      INSERT INTO shopping_items (list_id, household_id, name, category, quantity, unit, note, store_id, estimated_unit_price, created_by)
      VALUES (
        ${data.listId}, ${data.householdId}, ${data.name.trim()},
        ${data.category ?? null}, ${data.quantity ?? null}, ${data.unit ?? null},
        ${data.note ?? null}, ${data.store_id ?? null}, ${data.estimated_unit_price ?? null},
        ${user.id}
      ) RETURNING id
    `;
    return { id: item.id };
  });

export const updateItemStatusFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    itemId: z.string(),
    householdId: z.string(),
    status: z.enum(["active", "bought", "unavailable", "deleted"]),
  }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    await requireHouseholdMember(user.id, data.householdId);
    const sql = getDb();
    const bought = data.status === "bought";
    await sql`
      UPDATE shopping_items SET
        status = ${data.status},
        bought_by = ${bought ? user.id : null},
        bought_at = ${bought ? new Date() : null},
        updated_at = now()
      WHERE id = ${data.itemId} AND household_id = ${data.householdId}
    `;
    return { ok: true };
  });

export const deleteItemFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ itemId: z.string(), householdId: z.string() }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    await requireHouseholdMember(user.id, data.householdId);
    const sql = getDb();
    await sql`
      UPDATE shopping_items SET status = 'deleted', updated_at = now()
      WHERE id = ${data.itemId} AND household_id = ${data.householdId}
    `;
    return { ok: true };
  });

// ── PRODUCT DICTIONARY ─────────────────────────────────────────────────────
export const getDictionaryFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ householdId: z.string() }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    await requireHouseholdMember(user.id, data.householdId);
    const sql = getDb();
    return sql<{
      id: string; phrase: string; normalized_phrase: string; category: string | null;
      default_store_id: string | null; barcode: string | null;
    }[]>`
      SELECT id, phrase, normalized_phrase, category, default_store_id, barcode
      FROM household_product_dictionary
      WHERE household_id = ${data.householdId}
      ORDER BY phrase
    `;
  });

// ── RENAME HOUSEHOLD ───────────────────────────────────────────────────────
export const renameHouseholdFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ householdId: z.string(), name: z.string().min(1) }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    await requireHouseholdMember(user.id, data.householdId, true);
    const sql = getDb();
    await sql`UPDATE households SET name = ${data.name.trim()}, updated_at = now() WHERE id = ${data.householdId}`;
    return { ok: true };
  });

// ── CHANGE MEMBER ROLE ─────────────────────────────────────────────────────
export const changeRoleFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ householdId: z.string(), memberId: z.string(), role: z.string() }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    await requireHouseholdMember(user.id, data.householdId, true);
    const sql = getDb();
    await sql`UPDATE household_members SET role = ${data.role} WHERE id = ${data.memberId} AND household_id = ${data.householdId}`;
    return { ok: true };
  });

// ── GET SINGLE ITEM ────────────────────────────────────────────────────────
export const getItemFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ itemId: z.string(), householdId: z.string() }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    await requireHouseholdMember(user.id, data.householdId);
    const sql = getDb();
    const [item] = await sql<{
      id: string; list_id: string; name: string; category: string | null;
      quantity: number | null; unit: string | null; note: string | null; status: string;
      store_id: string | null; estimated_unit_price: number | null;
      created_by: string | null; bought_by: string | null; bought_at: string | null;
      created_at: string; updated_at: string;
    }[]>`
      SELECT id, list_id, name, category, quantity, unit, note, status, store_id,
             estimated_unit_price, created_by, bought_by, bought_at, created_at, updated_at
      FROM shopping_items WHERE id = ${data.itemId} AND household_id = ${data.householdId}
    `;
    return item ?? null;
  });

// ── UPDATE ITEM ────────────────────────────────────────────────────────────
export const updateItemFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    itemId: z.string(),
    householdId: z.string(),
    name: z.string().optional(),
    category: z.string().nullable().optional(),
    quantity: z.number().nullable().optional(),
    unit: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
    store_id: z.string().nullable().optional(),
    estimated_unit_price: z.number().nullable().optional(),
  }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    await requireHouseholdMember(user.id, data.householdId);
    const sql = getDb();
    await sql`
      UPDATE shopping_items SET
        name = COALESCE(${data.name ?? null}, name),
        category = COALESCE(${data.category ?? null}, category),
        quantity = ${data.quantity !== undefined ? data.quantity : null},
        unit = ${data.unit !== undefined ? data.unit : null},
        note = ${data.note !== undefined ? data.note : null},
        store_id = ${data.store_id !== undefined ? data.store_id : null},
        estimated_unit_price = ${data.estimated_unit_price !== undefined ? data.estimated_unit_price : null},
        updated_at = now()
      WHERE id = ${data.itemId} AND household_id = ${data.householdId}
    `;
    return { ok: true };
  });

// ── GET HISTORY (bought items) ─────────────────────────────────────────────
export const getHistoryFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ householdId: z.string() }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    await requireHouseholdMember(user.id, data.householdId);
    const sql = getDb();
    return sql<{
      id: string; name: string; category: string | null; quantity: number | null;
      unit: string | null; bought_at: string | null; list_id: string;
    }[]>`
      SELECT id, name, category, quantity, unit, bought_at, list_id
      FROM shopping_items
      WHERE household_id = ${data.householdId} AND status = 'bought'
      ORDER BY bought_at DESC NULLS LAST
      LIMIT 200
    `;
  });

// ── RECEIPTS ───────────────────────────────────────────────────────────────
export const getReceiptsFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ householdId: z.string() }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    await requireHouseholdMember(user.id, data.householdId);
    const sql = getDb();
    return sql<{
      id: string; store_id: string | null; receipt_date: string | null;
      total_amount: number | null; ocr_status: string | null; created_at: string;
    }[]>`
      SELECT id, store_id, receipt_date, total_amount, ocr_status, created_at
      FROM receipts WHERE household_id = ${data.householdId}
      ORDER BY created_at DESC
    `;
  });

export const addReceiptFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    householdId: z.string(),
    store_id: z.string().nullable().optional(),
    receipt_date: z.string().nullable().optional(),
    total_amount: z.number().nullable().optional(),
  }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    await requireHouseholdMember(user.id, data.householdId);
    const sql = getDb();
    const [receipt] = await sql<{ id: string }[]>`
      INSERT INTO receipts (household_id, store_id, receipt_date, total_amount, ocr_status, created_by)
      VALUES (${data.householdId}, ${data.store_id ?? null}, ${data.receipt_date ?? null},
              ${data.total_amount ?? null}, 'awaiting_review', ${user.id})
      RETURNING id
    `;
    return { id: receipt.id };
  });

// ── SAVE LIST SETTINGS ─────────────────────────────────────────────────────
export const saveListSettingsFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    listId: z.string(),
    householdId: z.string(),
    budget_amount: z.number().nullable().optional(),
    default_store_id: z.string().nullable().optional(),
    estimated_total: z.number().nullable().optional(),
  }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    await requireHouseholdMember(user.id, data.householdId, true);
    const sql = getDb();
    await sql`
      UPDATE shopping_lists SET
        budget_amount = ${data.budget_amount ?? null},
        default_store_id = ${data.default_store_id ?? null},
        estimated_total = ${data.estimated_total ?? null},
        updated_at = now()
      WHERE id = ${data.listId} AND household_id = ${data.householdId}
    `;
    return { ok: true };
  });

// ── FINISH SHOPPING ────────────────────────────────────────────────────────
export const finishShoppingFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ listId: z.string(), householdId: z.string(), status: z.enum(["done", "partially_done"]) }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    await requireHouseholdMember(user.id, data.householdId, true);
    const sql = getDb();
    await sql`
      UPDATE shopping_lists SET status = ${data.status}, completed_at = now(), updated_at = now()
      WHERE id = ${data.listId} AND household_id = ${data.householdId}
    `;
    return { ok: true };
  });

// ── SAVE PRICE HISTORY ─────────────────────────────────────────────────────
export const savePriceFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    householdId: z.string(),
    storeId: z.string(),
    productName: z.string().min(1),
    category: z.string().nullable().optional(),
    unit: z.string().nullable().optional(),
    price: z.number().min(0),
  }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    await requireHouseholdMember(user.id, data.householdId);
    const sql = getDb();
    const normalized = data.productName.toLowerCase().replace(/[^a-z0-9\s]+/g, " ").trim();
    await sql`
      INSERT INTO product_price_history
        (household_id, store_id, product_name, normalized_product_name, category, unit, price, created_by)
      VALUES (${data.householdId}, ${data.storeId}, ${data.productName.trim()}, ${normalized},
              ${data.category ?? null}, ${data.unit ?? null}, ${data.price}, ${user.id})
    `;
    return { ok: true };
  });

// ── QUICK ADD (bulk items) ─────────────────────────────────────────────────
export const quickAddItemsFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    householdId: z.string(),
    listId: z.string(),
    items: z.array(z.object({
      name: z.string().min(1),
      quantity: z.number().nullable().optional(),
      unit: z.string().nullable().optional(),
      category: z.string().nullable().optional(),
      store_id: z.string().nullable().optional(),
    })),
  }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    await requireHouseholdMember(user.id, data.householdId);
    const sql = getDb();
    for (const item of data.items) {
      await sql`
        INSERT INTO shopping_items (list_id, household_id, name, quantity, unit, category, store_id, created_by)
        VALUES (${data.listId}, ${data.householdId}, ${item.name.trim()}, ${item.quantity ?? null},
                ${item.unit ?? null}, ${item.category ?? null}, ${item.store_id ?? null}, ${user.id})
      `;
    }
    return { ok: true, count: data.items.length };
  });

export const upsertDictionaryEntryFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    householdId: z.string(),
    phrase: z.string().min(1),
    category: z.string().nullable().optional(),
    default_store_id: z.string().nullable().optional(),
    barcode: z.string().nullable().optional(),
  }))
  .handler(async ({ data }) => {
    const user = await requireUser();
    await requireHouseholdMember(user.id, data.householdId);
    const sql = getDb();
    const phrase = data.phrase.trim();
    const normalized = phrase.toLowerCase().replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim();
    const [entry] = await sql<{ id: string }[]>`
      INSERT INTO household_product_dictionary
        (household_id, phrase, normalized_phrase, category, default_store_id, barcode, updated_by)
      VALUES (${data.householdId}, ${phrase}, ${normalized}, ${data.category ?? null},
              ${data.default_store_id ?? null}, ${data.barcode ?? null}, ${user.id})
      ON CONFLICT (household_id, normalized_phrase) DO UPDATE SET
        phrase = EXCLUDED.phrase,
        category = COALESCE(EXCLUDED.category, household_product_dictionary.category),
        default_store_id = COALESCE(EXCLUDED.default_store_id, household_product_dictionary.default_store_id),
        barcode = COALESCE(EXCLUDED.barcode, household_product_dictionary.barcode),
        updated_by = EXCLUDED.updated_by,
        updated_at = now()
      RETURNING id
    `;
    return { id: entry.id };
  });

export const logActivityFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    household_id: z.string(),
    user_id: z.string(),
    action: z.string(),
    description: z.string().optional(),
    list_id: z.string().nullable().optional(),
    item_id: z.string().nullable().optional(),
  }))
  .handler(async ({ data }) => {
    const sql = getDb();
    await sql`
      INSERT INTO activity_log (household_id, user_id, action, description, list_id, item_id)
      VALUES (${data.household_id}, ${data.user_id}, ${data.action},
              ${data.description ?? null}, ${data.list_id ?? null}, ${data.item_id ?? null})
    `;
    return { ok: true };
  });
