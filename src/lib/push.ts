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

export function isHttpsOrLocalhost() {
  if (typeof window === "undefined") return false;
  const { protocol, hostname } = window.location;
  return protocol === "https:" || hostname === "localhost" || hostname === "127.0.0.1";
}

export function hasVapidPublicKey() {
  return !!VAPID_PUBLIC_KEY;
}

export function getPushPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

export function getDefaultPushPreferences(): Required<PushPreferences> {
  return { ...DEFAULT_PREFERENCES };
}

async function ensureServiceWorker() {
  if (!isPushSupported()) throw new Error("Ta przegladarka nie obsluguje powiadomien push.");
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
  if (!json.endpoint || !p256dh || !auth) {
    throw new Error("Nie udalo sie odczytac subskrypcji push.");
  }
  return { endpoint: json.endpoint, p256dh, auth };
}

async function invokePushFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) {
    throw new Error(error.message || "Brakuje konfiguracji push.");
  }
  return data as T;
}

export async function getExistingPushSubscription() {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration(SW_PATH);
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

export async function subscribeToPush(householdId: string, preferences?: PushPreferences) {
  if (!VAPID_PUBLIC_KEY) throw new Error("Brakuje konfiguracji push.");
  if (!isHttpsOrLocalhost()) throw new Error("Powiadomienia push wymagaja HTTPS lub localhost.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Brak zgody na powiadomienia push.");

  const registration = await ensureServiceWorker();
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

  await invokePushFunction("save-push-subscription", {
    household_id: householdId,
    ...serializeSubscription(subscription),
    preferences: { ...DEFAULT_PREFERENCES, ...(preferences ?? {}) },
    user_agent: navigator.userAgent,
  });

  return subscription;
}

export async function unsubscribeFromPush(householdId: string) {
  const subscription = await getExistingPushSubscription();
  if (!subscription) return;
  await invokePushFunction("delete-push-subscription", {
    household_id: householdId,
    endpoint: subscription.endpoint,
  });
  await subscription.unsubscribe();
}

export async function loadPushPreferences(
  _householdId: string,
): Promise<Required<PushPreferences>> {
  return getDefaultPushPreferences();
}

export async function updatePushPreferences(householdId: string, preferences: PushPreferences) {
  const subscription = await getExistingPushSubscription();
  if (!subscription) throw new Error("Brak aktywnej subskrypcji push.");
  await invokePushFunction("save-push-subscription", {
    household_id: householdId,
    ...serializeSubscription(subscription),
    preferences: { ...DEFAULT_PREFERENCES, ...preferences },
    user_agent: navigator.userAgent,
  });
}

export async function sendTestPush(householdId: string) {
  return invokePushFunction("send-push-notification", {
    household_id: householdId,
    type: "test",
    title: "Family Cart",
    body: "Test powiadomien push",
    url: "/settings",
  }) as Promise<{ sent: number; failed: number }>;
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
    await invokePushFunction("send-push-notification", {
      household_id: params.householdId,
      type: params.type,
      title: params.title ?? "Family Cart",
      body: params.body,
      list_id: params.listId ?? null,
      item_id: params.itemId ?? null,
      url: params.url ?? "/",
    });
  } catch (error) {
    console.warn("[push] skipped", error instanceof Error ? error.message : error);
  }
}
