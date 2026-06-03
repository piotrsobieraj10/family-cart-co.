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
    if (!householdId || !endpoint) throw new Error("Brakuje danych subskrypcji");

    const { error } = await userClient
      .from("push_subscriptions")
      .update({ enabled: false })
      .eq("household_id", householdId)
      .eq("user_id", authData.user.id)
      .eq("endpoint", endpoint);
    if (error) throw error;

    return Response.json({ ok: true }, { headers: corsHeaders });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Nie udało się wyłączyć powiadomień" },
      { status: 400, headers: corsHeaders },
    );
  }
});
