import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authorization = request.headers.get("Authorization");
    if (!authorization) throw new Error("Brak autoryzacji");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) throw new Error("Nieprawidłowa sesja");

    const body = await request.json();
    const householdId = String(body.household_id ?? "");
    const endpoint = String(body.endpoint ?? "");
    const p256dh = String(body.p256dh ?? "");
    const auth = String(body.auth ?? "");
    const userAgent = body.user_agent ? String(body.user_agent).slice(0, 500) : null;
    const preferences =
      typeof body.preferences === "object" && body.preferences ? body.preferences : {};

    if (!householdId || !endpoint || !p256dh || !auth) {
      throw new Error("Brakuje danych subskrypcji push");
    }

    const { data: membership } = await userClient
      .from("household_members")
      .select("id")
      .eq("household_id", householdId)
      .eq("user_id", authData.user.id)
      .eq("status", "active")
      .maybeSingle();
    if (!membership) throw new Error("Nie masz dostępu do tego domu");

    const { error } = await userClient.from("push_subscriptions").upsert(
      {
        household_id: householdId,
        user_id: authData.user.id,
        endpoint,
        p256dh,
        auth,
        user_agent: userAgent,
        enabled: true,
        preferences,
      },
      { onConflict: "user_id,household_id,endpoint" },
    );
    if (error) throw error;

    return Response.json({ ok: true }, { headers: corsHeaders });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Nie udało się zapisać subskrypcji" },
      { status: 400, headers: corsHeaders },
    );
  }
});
