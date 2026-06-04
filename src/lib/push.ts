// Push notifications — stub for local Replit PostgreSQL setup.
// Edge Functions (save/delete/send-push-subscription) are not available without Supabase.
// The UI is preserved; actual push sending is disabled.

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

export async function subscribeToPush(_householdId: string, _preferences?: PushPreferences) {
  throw new Error(
    "Push notifications wymagają konfiguracji VAPID_PRIVATE_KEY. Funkcja dostępna w pełnej konfiguracji."
  );
}

export async function unsubscribeFromPush(_householdId: string) {
  const subscription = await getExistingPushSubscription();
  if (subscription) await subscription.unsubscribe();
}

export async function loadPushPreferences(_householdId: string): Promise<Required<PushPreferences>> {
  return getDefaultPushPreferences();
}

export async function updatePushPreferences(_householdId: string, _preferences: PushPreferences) {
  throw new Error("Push notifications wymagają konfiguracji VAPID_PRIVATE_KEY.");
}

export async function sendTestPush(_householdId: string) {
  throw new Error(
    "Push notifications wymagają konfiguracji VAPID_PRIVATE_KEY i wdrożenia Edge Functions."
  );
}

export async function notifyHousehold(_params: {
  householdId: string;
  type: string;
  title?: string;
  body: string;
  listId?: string | null;
  itemId?: string | null;
  url?: string;
}) {
  // stub — push notifications disabled in local setup
}
