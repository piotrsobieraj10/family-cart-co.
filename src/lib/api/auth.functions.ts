import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getSupabaseAdminClient,
  getSupabaseAnonServerClient,
  getSupabaseHost,
} from "@/integrations/supabase/client.server";
import { getUserFromRequest, requireUserFromRequest } from "@/lib/auth.server";

function publicUser(user: {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
}) {
  return {
    id: user.id,
    email: user.email ?? "",
    email_confirmed_at: user.email_confirmed_at ?? null,
  };
}

export const loginFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ email: z.string().email(), password: z.string().min(1) }))
  .handler(async ({ data }) => {
    const host = getSupabaseHost();
    console.log("[auth] supabase host", host ?? "missing");

    const { data: result, error } = await getSupabaseAnonServerClient().auth.signInWithPassword({
      email: data.email.trim().toLowerCase(),
      password: data.password,
    });

    if (error || !result.session) {
      console.error("[auth] error", error?.message ?? "Missing session");
      return { ok: false, error: error?.message ?? "Nieprawidlowy e-mail lub haslo." };
    }

    console.log("[auth] success", { userId: result.user.id });
    return {
      ok: true,
      token: result.session.access_token,
      refreshToken: result.session.refresh_token,
      userId: result.user.id,
      user: publicUser(result.user),
    };
  });

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
    const email = data.email.trim().toLowerCase();
    const firstName = data.first_name.trim();
    const householdName = data.household_name.trim();
    const displayName = firstName || email.split("@")[0];
    const anon = getSupabaseAnonServerClient();
    const admin = getSupabaseAdminClient();

    console.log("[auth] supabase host", getSupabaseHost() ?? "missing");
    const { data: signUp, error } = await anon.auth.signUp({
      email,
      password: data.password,
      options: {
        data: {
          display_name: displayName,
          first_name: firstName,
        },
      },
    });

    if (error || !signUp.user) {
      console.error("[auth] error", error?.message ?? "Missing user");
      return { ok: false, error: error?.message ?? "Nie udalo sie utworzyc konta." };
    }

    const userId = signUp.user.id;
    const { error: profileError } = await admin.from("profiles").upsert(
      {
        user_id: userId,
        display_name: displayName,
        email,
        first_name: firstName,
        must_complete_profile: false,
        must_change_password: false,
      },
      { onConflict: "user_id" },
    );
    if (profileError) return { ok: false, error: profileError.message };

    const { data: household, error: householdError } = await admin
      .from("households")
      .insert({ name: householdName, owner_id: userId })
      .select("id")
      .single();
    if (householdError) return { ok: false, error: householdError.message };

    const { error: memberError } = await admin.from("household_members").upsert(
      {
        household_id: household.id,
        user_id: userId,
        role: "owner",
        status: "active",
        created_by: userId,
      },
      { onConflict: "household_id,user_id" },
    );
    if (memberError) return { ok: false, error: memberError.message };

    console.log("[auth] success", { userId });
    return {
      ok: true,
      message: signUp.session
        ? "Konto zostalo utworzone. Mozesz sie zalogowac."
        : "Konto zostalo utworzone. Jesli Supabase wymaga potwierdzenia e-mail, sprawdz skrzynke.",
    };
  });

export const getMeFn = createServerFn({ method: "GET" }).handler(async () => {
  const user = await getUserFromRequest();
  return { user: user ? publicUser(user) : null };
});

export const getMyProfileFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ userId: z.string() }))
  .handler(async ({ data }) => {
    const caller = await requireUserFromRequest();
    const userId = data.userId === caller.id ? caller.id : caller.id;
    const { data: profile, error } = await getSupabaseAdminClient()
      .from("profiles")
      .select(
        "id, display_name, email, first_name, last_name, must_complete_profile, must_change_password",
      )
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    console.log(profile ? "[profile] loaded" : "[profile] missing", { userId });
    return profile ?? null;
  });

export const getMyHouseholdsFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ userId: z.string() }))
  .handler(async ({ data }) => {
    const caller = await requireUserFromRequest();
    const userId = data.userId === caller.id ? caller.id : caller.id;
    const { data: rows, error } = await getSupabaseAdminClient()
      .from("household_members")
      .select("household_id, role, status, households(id, name, owner_id)")
      .eq("user_id", userId)
      .eq("status", "active");
    if (error) throw new Error(error.message);
    console.log("[household] memberships count", rows?.length ?? 0);
    return rows ?? [];
  });

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
    const caller = await requireUserFromRequest();
    const userId = data.userId === caller.id ? caller.id : caller.id;
    const admin = getSupabaseAdminClient();

    if (data.new_password) {
      const { error } = await admin.auth.admin.updateUserById(userId, {
        password: data.new_password,
      });
      if (error) return { ok: false, error: error.message };
    }

    const patch = {
      ...(data.display_name !== undefined ? { display_name: data.display_name } : {}),
      ...(data.first_name !== undefined ? { first_name: data.first_name } : {}),
      ...(data.last_name !== undefined ? { last_name: data.last_name } : {}),
      ...(data.must_complete_profile !== undefined
        ? { must_complete_profile: data.must_complete_profile }
        : {}),
      ...(data.must_change_password !== undefined
        ? { must_change_password: data.must_change_password }
        : {}),
      updated_at: new Date().toISOString(),
    };

    const { error } = await admin.from("profiles").update(patch).eq("user_id", userId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });
