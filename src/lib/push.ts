import { supabase } from "@/integrations/supabase/client";

export type PushNotificationStatus =
  | "unsupported"
  | "default"
  | "granted"
  | "denied"
  | "subscribed"
  | "disabled";

export type PushPreferences = {
  item_added?: boolean;
  item_bought?: boolean;
  shopping_finished?: boolean;
  household_added?: boolean;
  reminders?: boolean;
};

const DEFAULT_PREFERENCES: Required<PushPreferences> = {
  item_added: true,
  item_bought: false,
  shopping_finished: true,
  household_added: true,
  reminders: false,
};

const SW_PATH = "/push-sw.js";
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getPushPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

export function getDefaultPushPreferences(): Required<PushPreferences> {
  return { ...DEFAULT_PREFERENCES };
}

async function ensureServiceWorker() {
  if (!isPushSupported()) throw new Error("Ta przeglądarka nie obsługuje powiadomień push.");
  const existing = await navigator.serviceWorker.getRegistration(SW_PATH);
  if (existing) return existing;
  const registration = await navigator.serviceWorker.register(SW_PATH);
  await navigator.serviceWorker.ready;
  return registration;
}

function serializeSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth)
    throw new Error("Nie udało się odczytać subskrypcji push.");
  return { endpoint: json.endpoint, p256dh, auth };
}

export async function getExistingPushSubscription() {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration(SW_PATH);
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

export async function subscribeToPush(householdId: string, preferences?: PushPreferences) {
  if (!VAPID_PUBLIC_KEY) {
    throw new Error("Brakuje VITE_VAPID_PUBLIC_KEY. Ustaw publiczny klucz VAPID w konfiguracji.");
  }
  if (!isPushSupported()) throw new Error("Ta przeglądarka nie obsługuje powiadomień push.");
  if (Notification.permission === "denied") {
    throw new Error("Powiadomienia są zablokowane w ustawieniach przeglądarki.");
  }
  if (Notification.permission !== "granted") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Nie udzielono zgody na powiadomienia.");
  }

  const registration = await ensureServiceWorker();
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

  const serialized = serializeSubscription(subscription);
  const mergedPreferences = { ...DEFAULT_PREFERENCES, ...(preferences ?? {}) };
  const { data, error } = await supabase.functions.invoke("save-push-subscription", {
    body: {
      household_id: householdId,
      ...serialized,
      user_agent: navigator.userAgent,
      preferences: mergedPreferences,
    },
  });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  return { subscription, preferences: mergedPreferences };
}

export async function unsubscribeFromPush(householdId: string) {
  const subscription = await getExistingPushSubscription();
  if (!subscription) return;
  const { endpoint } = serializeSubscription(subscription);
  await supabase.functions.invoke("delete-push-subscription", {
    body: { household_id: householdId, endpoint },
  });
  await subscription.unsubscribe();
}

export async function loadPushPreferences(householdId: string) {
  const subscription = await getExistingPushSubscription();
  if (!subscription) return getDefaultPushPreferences();
  const { endpoint } = serializeSubscription(subscription);
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("preferences")
    .eq("household_id", householdId)
    .eq("endpoint", endpoint)
    .eq("enabled", true)
    .maybeSingle();
  if (error) return getDefaultPushPreferences();
  return { ...DEFAULT_PREFERENCES, ...(data?.preferences ?? {}) };
}

export async function updatePushPreferences(householdId: string, preferences: PushPreferences) {
  const subscription = await getExistingPushSubscription();
  if (!subscription) throw new Error("Brak aktywnej subskrypcji push.");
  const serialized = serializeSubscription(subscription);
  const mergedPreferences = { ...DEFAULT_PREFERENCES, ...preferences };
  const { data, error } = await supabase.functions.invoke("save-push-subscription", {
    body: {
      household_id: householdId,
      ...serialized,
      user_agent: navigator.userAgent,
      preferences: mergedPreferences,
    },
  });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  return mergedPreferences;
}

export async function notifyHousehold(params: {
  householdId: string;
  type: string;
  title?: string;
  body: string;
  listId?: string | null;
  itemId?: string | null;
  url?: string;
}) {
  try {
    await supabase.functions.invoke("send-push-notification", {
      body: {
        household_id: params.householdId,
        notification_type: params.type,
        title: params.title ?? "Family Cart",
        body: params.body,
        payload: {
          type: params.type,
          household_id: params.householdId,
          list_id: params.listId ?? null,
          item_id: params.itemId ?? null,
          url: params.url ?? "/",
        },
      },
    });
  } catch (error) {
    console.warn("Push notification skipped", error);
  }
}
