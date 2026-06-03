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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authorization = request.headers.get("Authorization");
    if (!authorization) throw new Error("Brak autoryzacji");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) throw new Error("Nieprawidłowa sesja");

    const body = await request.json();
    const firstName = String(body.first_name ?? "").trim();
    const lastName = String(body.last_name ?? "").trim();
    const password = String(body.password ?? "");
    if (!firstName || !lastName) throw new Error("Podaj imię i nazwisko");
    if (password.length < 6) throw new Error("Nowe hasło musi mieć co najmniej 6 znaków");

    const { error: passwordError } = await adminClient.auth.admin.updateUserById(authData.user.id, {
      password,
    });
    if (passwordError) throw passwordError;

    const { error: profileError } = await adminClient
      .from("profiles")
      .update({
        first_name: firstName,
        last_name: lastName,
        display_name: `${firstName} ${lastName}`,
        must_complete_profile: false,
        must_change_password: false,
      })
      .eq("user_id", authData.user.id);
    if (profileError) throw profileError;

    return Response.json({ success: true }, { headers: corsHeaders });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Nie udało się uzupełnić profilu" },
      { status: 400, headers: corsHeaders },
    );
  }
});
