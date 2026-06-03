import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function preferenceAllows(preferences: Record<string, unknown> | null, type: string) {
  if (!preferences || typeof preferences !== "object") return true;
  if (preferences[type] === false) return false;
  return true;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? Deno.env.get("VITE_VAPID_PUBLIC_KEY") ?? "";
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:[UZUPEŁNIJ_ADRES_EMAIL]";
    if (!vapidPublicKey || !vapidPrivateKey) throw new Error("Brakuje konfiguracji VAPID");

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const authorization = request.headers.get("Authorization");
    if (!authorization) throw new Error("Brak autoryzacji");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) throw new Error("Nieprawidłowa sesja");

    const body = await request.json();
    const householdId = String(body.household_id ?? "");
    const notificationType = String(body.notification_type ?? body.type ?? "general");
    const title = String(body.title ?? "Family Cart").slice(0, 80);
    const message = String(body.body ?? "Masz nowe powiadomienie w Family Cart.").slice(0, 240);
    const payload = typeof body.payload === "object" && body.payload ? body.payload : {};
    const includeActor = body.include_actor === true;

    if (!householdId) throw new Error("Brakuje household_id");
    const { data: membership } = await userClient
      .from("household_members")
      .select("id")
      .eq("household_id", householdId)
      .eq("user_id", authData.user.id)
      .eq("status", "active")
      .maybeSingle();
    if (!membership) throw new Error("Nie masz dostępu do tego domu");

    const { data: subscriptions, error: subError } = await adminClient
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth, preferences")
      .eq("household_id", householdId)
      .eq("enabled", true);
    if (subError) throw subError;

    let sent = 0;
    let failed = 0;
    for (const subscription of subscriptions ?? []) {
      if (!includeActor && subscription.user_id === authData.user.id) continue;
      if (!preferenceAllows(subscription.preferences as Record<string, unknown> | null, notificationType)) continue;

      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify({ title, body: message, type: notificationType, payload, url: (payload as { url?: string }).url ?? "/" }),
        );
        sent += 1;
        await adminClient.from("push_notification_log").insert({
          household_id: householdId,
          user_id: subscription.user_id,
          notification_type: notificationType,
          title,
          body: message,
          payload,
          status: "sent",
          sent_at: new Date().toISOString(),
        });
      } catch (error) {
        failed += 1;
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await adminClient
            .from("push_subscriptions")
            .update({ enabled: false })
            .eq("id", subscription.id);
        }
        await adminClient.from("push_notification_log").insert({
          household_id: householdId,
          user_id: subscription.user_id,
          notification_type: notificationType,
          title,
          body: message,
          payload,
          status: "failed",
          error: error instanceof Error ? error.message : "push_failed",
        });
      }
    }

    return Response.json({ ok: true, sent, failed }, { headers: corsHeaders });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Nie udało się wysłać powiadomienia" },
      { status: 400, headers: corsHeaders },
    );
  }
});
