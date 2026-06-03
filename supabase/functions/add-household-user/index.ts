import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Role = "admin" | "member" | "viewer";

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authorization = request.headers.get("Authorization");
    if (!authorization) throw new Error("Brak autoryzacji");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) throw new Error("Nieprawidłowa sesja");
    if (!authData.user.email_confirmed_at) {
      throw new Error("Potwierdź adres e-mail, aby korzystać z aplikacji.");
    }

    const body = await request.json();
    const householdId = String(body.household_id ?? "");
    const email = String(body.email ?? "")
      .trim()
      .toLocaleLowerCase();
    const temporaryPassword = String(body.temporary_password ?? "");
    const role = String(body.role ?? "") as Role;
    const label = body.label ? String(body.label).trim() : null;

    if (!householdId || !email || !email.includes("@"))
      throw new Error("Podaj prawidłowy adres e-mail");
    if (temporaryPassword.length < 6)
      throw new Error("Hasło tymczasowe musi mieć co najmniej 6 znaków");
    if (!["admin", "member", "viewer"].includes(role)) throw new Error("Nieprawidłowa rola");

    const { data: callerMembership } = await adminClient
      .from("household_members")
      .select("role")
      .eq("household_id", householdId)
      .eq("user_id", authData.user.id)
      .eq("status", "active")
      .maybeSingle();
    if (!callerMembership || !["owner", "admin"].includes(callerMembership.role)) {
      throw new Error("Nie masz uprawnień do dodawania użytkowników");
    }

    let existingUser = null;
    for (let page = 1; page <= 10 && !existingUser; page += 1) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      existingUser = data.users.find((user) => user.email?.toLocaleLowerCase() === email) ?? null;
      if (data.users.length < 1000) break;
    }

    let userId: string;
    let created = false;
    let registrationTokenHash: string | null = null;
    if (existingUser) {
      userId = existingUser.id;
    } else {
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
        await adminClient
          .from("pending_registrations")
          .delete()
          .eq("token_hash", registrationTokenHash);
        throw error ?? new Error("Nie udało się utworzyć konta");
      }
      userId = data.user.id;
      created = true;
      const { error: profileError } = await adminClient
        .from("profiles")
        .update({ must_complete_profile: true, must_change_password: true })
        .eq("user_id", userId);
      if (profileError) throw profileError;
    }

    const { data: existingMembership } = await adminClient
      .from("household_members")
      .select("id, status")
      .eq("household_id", householdId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existingMembership?.status === "active") {
      return Response.json({ code: "already_member", created: false }, { headers: corsHeaders });
    }

    const membershipPayload = {
      role,
      status: "active",
      created_by: authData.user.id,
      label,
    };
    const membershipResult = existingMembership
      ? await adminClient
          .from("household_members")
          .update(membershipPayload)
          .eq("id", existingMembership.id)
      : await adminClient.from("household_members").insert({
          household_id: householdId,
          user_id: userId,
          ...membershipPayload,
        });
    const { error: membershipError } = membershipResult;
    if (membershipError) {
      if (created) await adminClient.auth.admin.deleteUser(userId);
      if (registrationTokenHash) {
        await adminClient
          .from("pending_registrations")
          .delete()
          .eq("token_hash", registrationTokenHash);
      }
      throw membershipError;
    }

    return Response.json({ created, user_id: userId }, { headers: corsHeaders });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Nie udało się dodać użytkownika" },
      { status: 400, headers: corsHeaders },
    );
  }
});
