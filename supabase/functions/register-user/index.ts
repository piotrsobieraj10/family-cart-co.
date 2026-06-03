import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type RegistrationMode = "open" | "invite_code" | "disabled";

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function expectedError(code: string, message: string) {
  return Response.json({ ok: false, code, message }, { headers: corsHeaders });
}

async function releaseCodeReservation(
  adminClient: ReturnType<typeof createClient>,
  codeId: string | null,
) {
  if (!codeId) return;
  const { data: code } = await adminClient
    .from("registration_codes")
    .select("used_count")
    .eq("id", codeId)
    .maybeSingle();
  if (code && code.used_count > 0) {
    await adminClient
      .from("registration_codes")
      .update({ used_count: code.used_count - 1 })
      .eq("id", codeId)
      .eq("used_count", code.used_count);
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const registrationModeValue = Deno.env.get("REGISTRATION_MODE") ?? "open";
  const registrationMode: RegistrationMode = ["open", "invite_code", "disabled"].includes(
    registrationModeValue,
  )
    ? (registrationModeValue as RegistrationMode)
    : "disabled";
  const appUrl = Deno.env.get("APP_URL")?.trim();
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  let pendingTokenHash: string | null = null;
  let reservedCodeId: string | null = null;

  try {
    const body = await request.json();
    const firstName = String(body.first_name ?? "").trim();
    const email = String(body.email ?? "")
      .trim()
      .toLocaleLowerCase();
    const password = String(body.password ?? "");
    const householdName = String(body.household_name ?? "").trim();
    const inviteCode = String(body.invite_code ?? "").trim();

    if (registrationMode === "disabled") {
      return expectedError(
        "registration_disabled",
        "Rejestracja jest obecnie wyłączona. Poproś administratora domu o dodanie konta.",
      );
    }
    if (!firstName || !householdName || !email.includes("@")) {
      return expectedError("invalid_form", "Uzupełnij imię, e-mail i nazwę domu.");
    }
    if (password.length < 6) {
      return expectedError("invalid_password", "Hasło musi mieć co najmniej 6 znaków.");
    }

    if (registrationMode === "invite_code") {
      if (!inviteCode) {
        return expectedError("invalid_invite_code", "Nieprawidłowy kod rejestracyjny.");
      }
      const codeHash = await sha256(inviteCode);
      const { data: code } = await adminClient
        .from("registration_codes")
        .select("id, active, max_uses, used_count, expires_at")
        .eq("code_hash", codeHash)
        .maybeSingle();

      if (!code || !code.active) {
        return expectedError("invalid_invite_code", "Nieprawidłowy kod rejestracyjny.");
      }
      if (code.expires_at && new Date(code.expires_at).getTime() <= Date.now()) {
        return expectedError("expired_invite_code", "Ten kod rejestracyjny wygasł.");
      }
      if (code.max_uses !== null && code.used_count >= code.max_uses) {
        return expectedError("invalid_invite_code", "Nieprawidłowy kod rejestracyjny.");
      }

      const { data: reserved } = await adminClient
        .from("registration_codes")
        .update({ used_count: code.used_count + 1 })
        .eq("id", code.id)
        .eq("used_count", code.used_count)
        .select("id")
        .maybeSingle();
      if (!reserved) {
        return expectedError("invalid_invite_code", "Nieprawidłowy kod rejestracyjny.");
      }
      reservedCodeId = code.id;
    }

    const registrationToken = crypto.randomUUID();
    pendingTokenHash = await sha256(registrationToken);
    const { error: pendingError } = await adminClient.from("pending_registrations").insert({
      token_hash: pendingTokenHash,
      email,
      first_name: firstName,
      pending_household_name: householdName,
      registration_source: "self_signup",
      code_id: reservedCodeId,
    });
    if (pendingError) throw pendingError;

    const authClient = createClient(supabaseUrl, anonKey);
    const { data: signUpData, error: signUpError } = await authClient.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: appUrl || undefined,
        data: {
          display_name: firstName,
          first_name: firstName,
          pending_household_name: householdName,
          registration_source: "self_signup",
          registration_token: registrationToken,
        },
      },
    });
    if (signUpError) throw signUpError;

    if (signUpData.user && signUpData.user.identities?.length === 0) {
      await adminClient.from("pending_registrations").delete().eq("token_hash", pendingTokenHash);
      await releaseCodeReservation(adminClient, reservedCodeId);
      pendingTokenHash = null;
      reservedCodeId = null;
    }

    return Response.json(
      {
        ok: true,
        message: "Konto zostało utworzone. Sprawdź e-mail i potwierdź rejestrację.",
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    if (pendingTokenHash) {
      await adminClient.from("pending_registrations").delete().eq("token_hash", pendingTokenHash);
    }
    await releaseCodeReservation(adminClient, reservedCodeId);

    return Response.json(
      {
        ok: false,
        code: "registration_failed",
        message: error instanceof Error ? error.message : "Nie udało się utworzyć konta.",
      },
      { status: 400, headers: corsHeaders },
    );
  }
});
