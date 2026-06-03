import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Role = "admin" | "member" | "viewer";

type JsonResponse = {
  ok: boolean;
  code?: string;
  error?: string;
  created?: boolean;
  user_id?: string;
};

function json(payload: JsonResponse, status = 200) {
  return Response.json(payload, { status, headers: corsHeaders });
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeEmail(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase();
}

function normalizeRole(value: unknown): Role | null {
  const role = String(value ?? "");
  if (["admin", "member", "viewer"].includes(role)) return role as Role;
  return null;
}

async function findUserByEmail(adminClient: ReturnType<typeof createClient>, email: string) {
  // First use the public profile table because it is fast and avoids paging through all auth users.
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("user_id, email")
    .ilike("email", email)
    .maybeSingle();

  if (profileError && profileError.code !== "PGRST116") throw profileError;
  if (profile?.user_id) return { id: profile.user_id, email: profile.email };

  // Fallback: Admin API has no direct getUserByEmail, so page through auth users.
  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLocaleLowerCase() === email);
    if (found) return found;
    if (data.users.length < 1000) break;
  }

  return null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ ok: false, code: "method_not_allowed", error: "Nieprawidłowa metoda" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({
        ok: false,
        code: "missing_env",
        error:
          "Brakuje konfiguracji Edge Function. Sprawdź SUPABASE_URL, SUPABASE_ANON_KEY i SUPABASE_SERVICE_ROLE_KEY.",
      });
    }

    const authorization = request.headers.get("Authorization");
    if (!authorization) return json({ ok: false, code: "missing_auth", error: "Brak autoryzacji" });

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) {
      return json({ ok: false, code: "invalid_session", error: "Nieprawidłowa sesja" });
    }
    if (!authData.user.email_confirmed_at) {
      return json({
        ok: false,
        code: "email_not_confirmed",
        error: "Potwierdź adres e-mail, aby dodawać użytkowników.",
      });
    }

    const body = await request.json().catch(() => ({}));
    const householdId = String(body.household_id ?? "").trim();
    const email = normalizeEmail(body.email);
    const temporaryPassword = String(body.temporary_password ?? "");
    const role = normalizeRole(body.role);
    const label = body.label ? String(body.label).trim() : null;

    if (!householdId) return json({ ok: false, code: "missing_household", error: "Brak aktywnego domu/grupy" });
    if (!email || !email.includes("@")) {
      return json({ ok: false, code: "invalid_email", error: "Podaj prawidłowy adres e-mail" });
    }
    if (!role) return json({ ok: false, code: "invalid_role", error: "Nieprawidłowa rola" });

    const { data: callerMembership, error: callerError } = await adminClient
      .from("household_members")
      .select("role, status")
      .eq("household_id", householdId)
      .eq("user_id", authData.user.id)
      .eq("status", "active")
      .maybeSingle();

    if (callerError) throw callerError;
    if (!callerMembership || !["owner", "admin"].includes(callerMembership.role)) {
      return json({
        ok: false,
        code: "forbidden",
        error: "Nie masz uprawnień do dodawania użytkowników w tym domu/grupie.",
      });
    }

    const existingUser = await findUserByEmail(adminClient, email);

    let userId: string;
    let created = false;
    let registrationTokenHash: string | null = null;

    if (existingUser) {
      userId = existingUser.id;
    } else {
      if (temporaryPassword.length < 6) {
        return json({
          ok: false,
          code: "temporary_password_required",
          error:
            "Ten e-mail nie istnieje jeszcze w systemie. Podaj hasło tymczasowe min. 6 znaków, aby utworzyć nowe konto.",
        });
      }

      const registrationToken = crypto.randomUUID();
      registrationTokenHash = await sha256(registrationToken);
      const { error: pendingError } = await adminClient.from("pending_registrations").insert({
        token_hash: registrationTokenHash,
        email,
        registration_source: "admin_created",
      });
      if (pendingError) throw pendingError;

      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: {
          display_name: email.split("@")[0],
          registration_source: "admin_created",
          registration_token: registrationToken,
        },
      });

      if (error || !data.user) {
        await adminClient.from("pending_registrations").delete().eq("token_hash", registrationTokenHash);
        throw error ?? new Error("Nie udało się utworzyć konta");
      }

      userId = data.user.id;
      created = true;
    }

    // Make sure the profile exists and onboarding flags are correct for newly created accounts.
    const profilePayload = created
      ? {
          user_id: userId,
          email,
          display_name: email.split("@")[0],
          must_complete_profile: true,
          must_change_password: true,
        }
      : {
          user_id: userId,
          email,
        };

    const { error: profileUpsertError } = await adminClient
      .from("profiles")
      .upsert(profilePayload, { onConflict: "user_id" });
    if (profileUpsertError) throw profileUpsertError;

    const { data: existingMembership, error: existingMembershipError } = await adminClient
      .from("household_members")
      .select("id, status")
      .eq("household_id", householdId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existingMembershipError) throw existingMembershipError;

    if (existingMembership?.status === "active") {
      return json({ ok: true, code: "already_member", created: false, user_id: userId });
    }

    const membershipPayload = {
      role,
      status: "active",
      created_by: authData.user.id,
      label,
    };
    const membershipResult = existingMembership
      ? await adminClient.from("household_members").update(membershipPayload).eq("id", existingMembership.id)
      : await adminClient.from("household_members").insert({
          household_id: householdId,
          user_id: userId,
          ...membershipPayload,
        });

    const { error: membershipError } = membershipResult;
    if (membershipError) {
      if (created) await adminClient.auth.admin.deleteUser(userId);
      if (registrationTokenHash) {
        await adminClient.from("pending_registrations").delete().eq("token_hash", registrationTokenHash);
      }
      throw membershipError;
    }

    return json({ ok: true, created, user_id: userId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nie udało się dodać użytkownika";
    return json({ ok: false, code: "unexpected_error", error: message });
  }
});
