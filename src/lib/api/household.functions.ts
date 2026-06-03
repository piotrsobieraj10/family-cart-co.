import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getRequestHeader } from "@tanstack/start-server-core";

async function sha256(value: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

async function findUserByEmail(adminClient: ReturnType<typeof createClient>, email: string) {
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("user_id, email")
    .ilike("email", email)
    .maybeSingle();

  if (profileError && profileError.code !== "PGRST116") throw profileError;
  if (profile?.user_id) return { id: profile.user_id, email: profile.email };

  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLocaleLowerCase() === email);
    if (found) return found;
    if (data.users.length < 1000) break;
  }

  return null;
}

const AddHouseholdUserInput = z.object({
  household_id: z.string().min(1),
  email: z.string().email(),
  temporary_password: z.string().optional().default(""),
  role: z.enum(["admin", "member", "viewer"]),
  label: z.string().nullable().optional(),
});

export const addHouseholdUser = createServerFn({ method: "POST" })
  .inputValidator(AddHouseholdUserInput)
  .handler(async ({ data }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return { ok: false, code: "missing_env", error: "Brakuje konfiguracji serwera (SUPABASE_URL / SERVICE_ROLE_KEY)." };
    }

    const authorization = getRequestHeader("authorization") ?? getRequestHeader("Authorization");
    if (!authorization) {
      return { ok: false, code: "missing_auth", error: "Brak autoryzacji" };
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) {
      return { ok: false, code: "invalid_session", error: "Nieprawidłowa sesja" };
    }
    if (!authData.user.email_confirmed_at) {
      return { ok: false, code: "email_not_confirmed", error: "Potwierdź adres e-mail, aby dodawać użytkowników." };
    }

    const { household_id, email: rawEmail, temporary_password, role, label } = data;
    const email = normalizeEmail(rawEmail);

    const { data: callerMembership, error: callerError } = await adminClient
      .from("household_members")
      .select("role, status")
      .eq("household_id", household_id)
      .eq("user_id", authData.user.id)
      .eq("status", "active")
      .maybeSingle();

    if (callerError) throw callerError;
    if (!callerMembership || !["owner", "admin"].includes(callerMembership.role)) {
      return { ok: false, code: "forbidden", error: "Nie masz uprawnień do dodawania użytkowników w tym domu/grupie." };
    }

    const existingUser = await findUserByEmail(adminClient, email);

    let userId: string;
    let created = false;
    let registrationTokenHash: string | null = null;

    if (existingUser) {
      userId = existingUser.id;
    } else {
      if (!temporary_password || temporary_password.length < 6) {
        return {
          ok: false,
          code: "temporary_password_required",
          error: "Ten e-mail nie istnieje jeszcze w systemie. Podaj hasło tymczasowe min. 6 znaków, aby utworzyć nowe konto.",
        };
      }

      const registrationToken = crypto.randomUUID();
      registrationTokenHash = await sha256(registrationToken);

      const { error: pendingError } = await adminClient.from("pending_registrations").insert({
        token_hash: registrationTokenHash,
        email,
        registration_source: "admin_created",
      });
      if (pendingError) throw pendingError;

      const { data: newUserData, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password: temporary_password,
        email_confirm: true,
        user_metadata: {
          display_name: email.split("@")[0],
          registration_source: "admin_created",
          registration_token: registrationToken,
        },
      });

      if (createError || !newUserData.user) {
        await adminClient.from("pending_registrations").delete().eq("token_hash", registrationTokenHash);
        throw createError ?? new Error("Nie udało się utworzyć konta");
      }

      userId = newUserData.user.id;
      created = true;
    }

    const profilePayload = created
      ? { user_id: userId, email, display_name: email.split("@")[0], must_complete_profile: true, must_change_password: true }
      : { user_id: userId, email };

    const { error: profileUpsertError } = await adminClient
      .from("profiles")
      .upsert(profilePayload, { onConflict: "user_id" });
    if (profileUpsertError) throw profileUpsertError;

    const { data: existingMembership, error: existingMembershipError } = await adminClient
      .from("household_members")
      .select("id, status")
      .eq("household_id", household_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (existingMembershipError) throw existingMembershipError;

    if (existingMembership?.status === "active") {
      return { ok: true, code: "already_member", created: false, user_id: userId };
    }

    const membershipPayload = {
      role,
      status: "active",
      created_by: authData.user.id,
      label: label ?? null,
    };

    const membershipResult = existingMembership
      ? await adminClient.from("household_members").update(membershipPayload).eq("id", existingMembership.id)
      : await adminClient.from("household_members").insert({ household_id, user_id: userId, ...membershipPayload });

    if (membershipResult.error) {
      if (created) await adminClient.auth.admin.deleteUser(userId);
      if (registrationTokenHash) {
        await adminClient.from("pending_registrations").delete().eq("token_hash", registrationTokenHash);
      }
      throw membershipResult.error;
    }

    return { ok: true, created, user_id: userId };
  });
