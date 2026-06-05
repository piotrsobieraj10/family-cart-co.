import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAdminClient } from "@/integrations/supabase/client.server";
import { requireUserFromRequest } from "@/lib/auth.server";

type HouseholdRole = "owner" | "admin" | "member" | "viewer";
type HouseholdMemberRow = {
  id: string;
  user_id: string;
  role: HouseholdRole;
  status: string;
  label: string | null;
  profiles?:
    | {
        display_name: string | null;
        email: string | null;
      }
    | Array<{
        display_name: string | null;
        email: string | null;
      }>
    | null;
};

function normalize(value: string) {
  return value
    .toLocaleLowerCase("pl-PL")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

async function requireHouseholdMember(userId: string, householdId: string, adminOnly = false) {
  const { data, error } = await getSupabaseAdminClient()
    .from("household_members")
    .select("id, role")
    .eq("user_id", userId)
    .eq("household_id", householdId)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: not a member");
  if (adminOnly && !["owner", "admin"].includes(data.role)) {
    throw new Error("Forbidden: not an admin");
  }
  return data as { id: string; role: HouseholdRole };
}

async function findAuthUserByEmail(email: string) {
  const admin = getSupabaseAdminClient();
  let page = 1;
  while (page < 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    const found = data.users.find((user) => user.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 1000) return null;
    page += 1;
  }
  return null;
}

export const getHouseholdFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ householdId: z.string() }))
  .handler(async ({ data }) => {
    const user = await requireUserFromRequest();
    await requireHouseholdMember(user.id, data.householdId);
    const { data: household, error } = await getSupabaseAdminClient()
      .from("households")
      .select("id, name, owner_id")
      .eq("id", data.householdId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return household ?? null;
  });

export const createHouseholdFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ name: z.string().min(1) }))
  .handler(async ({ data }) => {
    const user = await requireUserFromRequest();
    const admin = getSupabaseAdminClient();
    const { data: household, error } = await admin
      .from("households")
      .insert({ name: data.name.trim(), owner_id: user.id })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { error: memberError } = await admin.from("household_members").upsert(
      {
        household_id: household.id,
        user_id: user.id,
        role: "owner",
        status: "active",
        created_by: user.id,
      },
      { onConflict: "household_id,user_id" },
    );
    if (memberError) throw new Error(memberError.message);
    return { id: household.id };
  });

export const getHouseholdMembersFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ householdId: z.string() }))
  .handler(async ({ data }) => {
    const user = await requireUserFromRequest();
    await requireHouseholdMember(user.id, data.householdId);
    const { data: members, error } = await getSupabaseAdminClient()
      .from("household_members")
      .select("id, user_id, role, status, label, profiles(display_name, email)")
      .eq("household_id", data.householdId)
      .eq("status", "active")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return ((members ?? []) as HouseholdMemberRow[]).map((member) => ({
      ...member,
      display_name:
        (Array.isArray(member.profiles) ? member.profiles[0] : member.profiles)?.display_name ??
        null,
      email: (Array.isArray(member.profiles) ? member.profiles[0] : member.profiles)?.email ?? null,
    }));
  });

export const removeMemberFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ householdId: z.string(), memberId: z.string() }))
  .handler(async ({ data }) => {
    const user = await requireUserFromRequest();
    await requireHouseholdMember(user.id, data.householdId, true);
    const admin = getSupabaseAdminClient();
    const { data: member, error: readError } = await admin
      .from("household_members")
      .select("role")
      .eq("id", data.memberId)
      .eq("household_id", data.householdId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (member?.role === "owner") throw new Error("Owner cannot be removed.");

    const { error } = await admin
      .from("household_members")
      .update({ status: "removed" })
      .eq("id", data.memberId)
      .eq("household_id", data.householdId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addHouseholdMemberFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      household_id: z.string(),
      email: z.string().email(),
      temporary_password: z.string().optional().default(""),
      role: z.enum(["admin", "member", "viewer"]),
      label: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const caller = await requireUserFromRequest();
    await requireHouseholdMember(caller.id, data.household_id, true);
    const admin = getSupabaseAdminClient();
    const email = data.email.trim().toLowerCase();
    const existingUser = await findAuthUserByEmail(email);

    let userId = existingUser?.id;
    let created = false;

    if (!userId) {
      if (!data.temporary_password || data.temporary_password.length < 6) {
        return {
          ok: false,
          code: "temporary_password_required",
          error: "Ten e-mail nie istnieje w systemie. Podaj haslo tymczasowe (min. 6 znakow).",
        };
      }
      const { data: createdUser, error } = await admin.auth.admin.createUser({
        email,
        password: data.temporary_password,
        email_confirm: true,
        user_metadata: { display_name: email.split("@")[0] },
      });
      if (error || !createdUser.user) {
        return { ok: false, error: error?.message ?? "Nie udalo sie utworzyc uzytkownika." };
      }
      userId = createdUser.user.id;
      created = true;
      await admin.from("profiles").upsert(
        {
          user_id: userId,
          email,
          display_name: email.split("@")[0],
          must_complete_profile: true,
          must_change_password: true,
        },
        { onConflict: "user_id" },
      );
    }

    const { data: existing, error: membershipReadError } = await admin
      .from("household_members")
      .select("id, status")
      .eq("household_id", data.household_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (membershipReadError) return { ok: false, error: membershipReadError.message };

    if (existing?.status === "active") {
      return { ok: true, code: "already_member", created: false, user_id: userId };
    }

    const payload = {
      household_id: data.household_id,
      user_id: userId,
      role: data.role,
      status: "active",
      created_by: caller.id,
      label: data.label ?? null,
    };
    const query = existing
      ? admin.from("household_members").update(payload).eq("id", existing.id)
      : admin.from("household_members").insert(payload);
    const { error } = await query;
    if (error) return { ok: false, error: error.message };

    return { ok: true, created, user_id: userId };
  });

export const getStoresFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ householdId: z.string() }))
  .handler(async ({ data }) => {
    const user = await requireUserFromRequest();
    await requireHouseholdMember(user.id, data.householdId);
    const { data: stores, error } = await getSupabaseAdminClient()
      .from("stores")
      .select("id, name, normalized_name")
      .eq("household_id", data.householdId)
      .order("name");
    if (error) throw new Error(error.message);
    return stores ?? [];
  });

export const createStoreFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ householdId: z.string(), name: z.string().min(1) }))
  .handler(async ({ data }) => {
    const user = await requireUserFromRequest();
    await requireHouseholdMember(user.id, data.householdId, true);
    const name = data.name.trim();
    const { data: store, error } = await getSupabaseAdminClient()
      .from("stores")
      .upsert(
        {
          household_id: data.householdId,
          name,
          normalized_name: normalize(name),
          created_by: user.id,
        },
        { onConflict: "household_id,normalized_name" },
      )
      .select("id, name")
      .single();
    if (error) throw new Error(error.message);
    return store;
  });

export const deleteStoreFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ storeId: z.string(), householdId: z.string() }))
  .handler(async ({ data }) => {
    const user = await requireUserFromRequest();
    await requireHouseholdMember(user.id, data.householdId, true);
    const { error } = await getSupabaseAdminClient()
      .from("stores")
      .delete()
      .eq("id", data.storeId)
      .eq("household_id", data.householdId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getActiveListFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ householdId: z.string() }))
  .handler(async ({ data }) => {
    const user = await requireUserFromRequest();
    await requireHouseholdMember(user.id, data.householdId);
    const { data: lists, error } = await getSupabaseAdminClient()
      .from("shopping_lists")
      .select("id, status, default_store_id, budget_amount, estimated_total, actual_total")
      .eq("household_id", data.householdId)
      .in("status", ["active", "shopping", "partially_done"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    return lists?.[0] ?? null;
  });

export const ensureActiveListFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ householdId: z.string() }))
  .handler(async ({ data }) => {
    const user = await requireUserFromRequest();
    await requireHouseholdMember(user.id, data.householdId);
    const existing = await getActiveListFn({ data: { householdId: data.householdId } });
    if (existing) return existing;

    const { data: list, error } = await getSupabaseAdminClient()
      .from("shopping_lists")
      .insert({
        household_id: data.householdId,
        created_by: user.id,
        name: "Lista zakupow",
        status: "active",
      })
      .select("id, status, default_store_id, budget_amount, estimated_total, actual_total")
      .single();
    if (error) throw new Error(error.message);
    return list;
  });

export const getShoppingItemsFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ listId: z.string(), householdId: z.string() }))
  .handler(async ({ data }) => {
    const user = await requireUserFromRequest();
    await requireHouseholdMember(user.id, data.householdId);
    const { data: items, error } = await getSupabaseAdminClient()
      .from("shopping_items")
      .select(
        "id, name, category, quantity, unit, note, status, store_id, estimated_unit_price, created_by:added_by, bought_by:checked_by, bought_at:checked_at",
      )
      .eq("list_id", data.listId)
      .eq("household_id", data.householdId)
      .neq("status", "deleted")
      .order("created_at");
    if (error) throw new Error(error.message);
    return items ?? [];
  });

export const addItemFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      listId: z.string(),
      householdId: z.string(),
      name: z.string().min(1),
      category: z.string().nullable().optional(),
      quantity: z.number().nullable().optional(),
      unit: z.string().nullable().optional(),
      note: z.string().nullable().optional(),
      store_id: z.string().nullable().optional(),
      estimated_unit_price: z.number().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const user = await requireUserFromRequest();
    await requireHouseholdMember(user.id, data.householdId);
    const { data: item, error } = await getSupabaseAdminClient()
      .from("shopping_items")
      .insert({
        list_id: data.listId,
        household_id: data.householdId,
        name: data.name.trim(),
        category: data.category ?? null,
        quantity: data.quantity ?? null,
        unit: data.unit ?? null,
        note: data.note ?? null,
        store_id: data.store_id ?? null,
        estimated_unit_price: data.estimated_unit_price ?? null,
        added_by: user.id,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: item.id };
  });

export const updateItemStatusFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      itemId: z.string(),
      householdId: z.string(),
      status: z.enum(["active", "bought", "unavailable", "deleted"]),
    }),
  )
  .handler(async ({ data }) => {
    const user = await requireUserFromRequest();
    await requireHouseholdMember(user.id, data.householdId);
    const bought = data.status === "bought";
    const { error } = await getSupabaseAdminClient()
      .from("shopping_items")
      .update({
        status: data.status,
        checked_by: bought ? user.id : null,
        checked_at: bought ? new Date().toISOString() : null,
      })
      .eq("id", data.itemId)
      .eq("household_id", data.householdId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteItemFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ itemId: z.string(), householdId: z.string() }))
  .handler(async ({ data }) => {
    const user = await requireUserFromRequest();
    await requireHouseholdMember(user.id, data.householdId);
    const { error } = await getSupabaseAdminClient()
      .from("shopping_items")
      .update({ status: "deleted" })
      .eq("id", data.itemId)
      .eq("household_id", data.householdId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getDictionaryFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ householdId: z.string() }))
  .handler(async ({ data }) => {
    const user = await requireUserFromRequest();
    await requireHouseholdMember(user.id, data.householdId);
    const { data: rows, error } = await getSupabaseAdminClient()
      .from("household_product_dictionary")
      .select("id, phrase, normalized_phrase, category, default_store_id, barcode")
      .eq("household_id", data.householdId)
      .order("phrase");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const renameHouseholdFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ householdId: z.string(), name: z.string().min(1) }))
  .handler(async ({ data }) => {
    const user = await requireUserFromRequest();
    await requireHouseholdMember(user.id, data.householdId, true);
    const { error } = await getSupabaseAdminClient()
      .from("households")
      .update({ name: data.name.trim() })
      .eq("id", data.householdId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const changeRoleFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      householdId: z.string(),
      memberId: z.string(),
      role: z.enum(["admin", "member", "viewer"]),
    }),
  )
  .handler(async ({ data }) => {
    const user = await requireUserFromRequest();
    await requireHouseholdMember(user.id, data.householdId, true);
    const admin = getSupabaseAdminClient();
    const { data: member, error: readError } = await admin
      .from("household_members")
      .select("role")
      .eq("id", data.memberId)
      .eq("household_id", data.householdId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (member?.role === "owner") throw new Error("Owner role cannot be changed here.");

    const { error } = await admin
      .from("household_members")
      .update({ role: data.role })
      .eq("id", data.memberId)
      .eq("household_id", data.householdId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getItemFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ itemId: z.string(), householdId: z.string() }))
  .handler(async ({ data }) => {
    const user = await requireUserFromRequest();
    await requireHouseholdMember(user.id, data.householdId);
    const { data: item, error } = await getSupabaseAdminClient()
      .from("shopping_items")
      .select(
        "id, list_id, name, category, quantity, unit, note, status, store_id, estimated_unit_price, created_by:added_by, bought_by:checked_by, bought_at:checked_at, created_at, updated_at",
      )
      .eq("id", data.itemId)
      .eq("household_id", data.householdId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return item ?? null;
  });

export const updateItemFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      itemId: z.string(),
      householdId: z.string(),
      name: z.string().optional(),
      category: z.string().nullable().optional(),
      quantity: z.number().nullable().optional(),
      unit: z.string().nullable().optional(),
      note: z.string().nullable().optional(),
      store_id: z.string().nullable().optional(),
      estimated_unit_price: z.number().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const user = await requireUserFromRequest();
    await requireHouseholdMember(user.id, data.householdId);
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name.trim();
    if (data.category !== undefined) patch.category = data.category;
    if (data.quantity !== undefined) patch.quantity = data.quantity;
    if (data.unit !== undefined) patch.unit = data.unit;
    if (data.note !== undefined) patch.note = data.note;
    if (data.store_id !== undefined) patch.store_id = data.store_id;
    if (data.estimated_unit_price !== undefined)
      patch.estimated_unit_price = data.estimated_unit_price;
    const { error } = await getSupabaseAdminClient()
      .from("shopping_items")
      .update(patch)
      .eq("id", data.itemId)
      .eq("household_id", data.householdId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getHistoryFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ householdId: z.string() }))
  .handler(async ({ data }) => {
    const user = await requireUserFromRequest();
    await requireHouseholdMember(user.id, data.householdId);
    const { data: items, error } = await getSupabaseAdminClient()
      .from("shopping_items")
      .select("id, name, category, quantity, unit, bought_at:checked_at, list_id")
      .eq("household_id", data.householdId)
      .eq("status", "bought")
      .order("checked_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return items ?? [];
  });

export const getReceiptsFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ householdId: z.string() }))
  .handler(async ({ data }) => {
    const user = await requireUserFromRequest();
    await requireHouseholdMember(user.id, data.householdId);
    const { data: receipts, error } = await getSupabaseAdminClient()
      .from("receipts")
      .select("id, store_id, receipt_date, total_amount, ocr_status, created_at")
      .eq("household_id", data.householdId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return receipts ?? [];
  });

export const addReceiptFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      householdId: z.string(),
      store_id: z.string().nullable().optional(),
      receipt_date: z.string().nullable().optional(),
      total_amount: z.number().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const user = await requireUserFromRequest();
    await requireHouseholdMember(user.id, data.householdId);
    const { data: receipt, error } = await getSupabaseAdminClient()
      .from("receipts")
      .insert({
        household_id: data.householdId,
        store_id: data.store_id ?? null,
        receipt_date: data.receipt_date ?? null,
        total_amount: data.total_amount ?? null,
        ocr_status: "awaiting_review",
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: receipt.id };
  });

export const saveListSettingsFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      listId: z.string(),
      householdId: z.string(),
      budget_amount: z.number().nullable().optional(),
      default_store_id: z.string().nullable().optional(),
      estimated_total: z.number().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const user = await requireUserFromRequest();
    await requireHouseholdMember(user.id, data.householdId, true);
    const { error } = await getSupabaseAdminClient()
      .from("shopping_lists")
      .update({
        budget_amount: data.budget_amount ?? null,
        default_store_id: data.default_store_id ?? null,
        estimated_total: data.estimated_total ?? null,
      })
      .eq("id", data.listId)
      .eq("household_id", data.householdId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const finishShoppingFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      listId: z.string(),
      householdId: z.string(),
      status: z.enum(["done", "partially_done"]),
    }),
  )
  .handler(async ({ data }) => {
    const user = await requireUserFromRequest();
    await requireHouseholdMember(user.id, data.householdId, true);
    const { error } = await getSupabaseAdminClient()
      .from("shopping_lists")
      .update({ status: data.status, completed_at: new Date().toISOString() })
      .eq("id", data.listId)
      .eq("household_id", data.householdId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const savePriceFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      householdId: z.string(),
      storeId: z.string(),
      productName: z.string().min(1),
      category: z.string().nullable().optional(),
      unit: z.string().nullable().optional(),
      price: z.number().min(0),
    }),
  )
  .handler(async ({ data }) => {
    const user = await requireUserFromRequest();
    await requireHouseholdMember(user.id, data.householdId);
    const { error } = await getSupabaseAdminClient()
      .from("product_price_history")
      .insert({
        household_id: data.householdId,
        store_id: data.storeId,
        product_name: data.productName.trim(),
        normalized_product_name: normalize(data.productName),
        category: data.category ?? null,
        unit: data.unit ?? null,
        price: data.price,
        created_by: user.id,
      });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const quickAddItemsFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      householdId: z.string(),
      listId: z.string(),
      items: z.array(
        z.object({
          name: z.string().min(1),
          quantity: z.number().nullable().optional(),
          unit: z.string().nullable().optional(),
          category: z.string().nullable().optional(),
          store_id: z.string().nullable().optional(),
        }),
      ),
    }),
  )
  .handler(async ({ data }) => {
    const user = await requireUserFromRequest();
    await requireHouseholdMember(user.id, data.householdId);
    const rows = data.items.map((item) => ({
      list_id: data.listId,
      household_id: data.householdId,
      name: item.name.trim(),
      quantity: item.quantity ?? null,
      unit: item.unit ?? null,
      category: item.category ?? null,
      store_id: item.store_id ?? null,
      added_by: user.id,
    }));
    const { error } = await getSupabaseAdminClient().from("shopping_items").insert(rows);
    if (error) throw new Error(error.message);
    return { ok: true, count: rows.length };
  });

export const upsertDictionaryEntryFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      householdId: z.string(),
      phrase: z.string().min(1),
      category: z.string().nullable().optional(),
      default_store_id: z.string().nullable().optional(),
      barcode: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const user = await requireUserFromRequest();
    await requireHouseholdMember(user.id, data.householdId);
    const phrase = data.phrase.trim();
    const { data: entry, error } = await getSupabaseAdminClient()
      .from("household_product_dictionary")
      .upsert(
        {
          household_id: data.householdId,
          phrase,
          normalized_phrase: normalize(phrase),
          category: data.category ?? null,
          default_store_id: data.default_store_id ?? null,
          barcode: data.barcode ?? null,
          updated_by: user.id,
          created_by: user.id,
        },
        { onConflict: "household_id,normalized_phrase" },
      )
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: entry.id };
  });

export const logActivityFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      household_id: z.string(),
      user_id: z.string(),
      action: z.string(),
      description: z.string().optional(),
      list_id: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { error } = await getSupabaseAdminClient().from("activity_log").insert({
      household_id: data.household_id,
      user_id: data.user_id,
      action: data.action,
      description: data.description ?? null,
      list_id: data.list_id ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
