import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
      return Response.json(
        {
          ok: false,
          code: "email_not_confirmed",
          message: "Potwierdź adres e-mail, aby korzystać z aplikacji.",
        },
        { headers: corsHeaders },
      );
    }

    const { data: memberships, error: membershipsError } = await adminClient
      .from("household_members")
      .select("household_id")
      .eq("user_id", authData.user.id)
      .eq("status", "active")
      .limit(1);
    if (membershipsError) throw membershipsError;
    if (memberships && memberships.length > 0) {
      return Response.json(
        { ok: true, created: false, household_id: memberships[0].household_id },
        { headers: corsHeaders },
      );
    }

    const registrationToken = String(authData.user.user_metadata?.registration_token ?? "");
    const registrationSource = String(authData.user.user_metadata?.registration_source ?? "");
    if (!registrationToken || registrationSource !== "self_signup") {
      return Response.json(
        { ok: true, created: false, code: "no_self_registration" },
        { headers: corsHeaders },
      );
    }

    const tokenHash = await sha256(registrationToken);
    const { data, error } = await adminClient.rpc("finalize_self_registration", {
      _user_id: authData.user.id,
      _token_hash: tokenHash,
    });
    if (error) throw error;

    const household = data?.[0];
    return Response.json(
      {
        ok: true,
        created: !!household,
        household_id: household?.household_id ?? null,
        household_name: household?.household_name ?? null,
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        code: "finalization_failed",
        message: error instanceof Error ? error.message : "Nie udało się utworzyć domu.",
      },
      { status: 400, headers: corsHeaders },
    );
  }
});
