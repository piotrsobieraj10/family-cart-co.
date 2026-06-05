import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/pages/RequireAuth";
import { getHouseholdFn } from "@/lib/api/data.functions";
import { getMyProfileFn } from "@/lib/api/auth.functions";
import { signOut } from "@/lib/auth";
import { BrandFooter } from "@/components/Brand";
import {
  ChevronRight,
  LogOut,
  Info,
  Shield,
  Home as HomeIcon,
  Store,
  ReceiptText,
  Bell,
} from "lucide-react";
import { useMyHouseholds } from "@/lib/household";
import { APP_AUTHOR_TEXT, APP_NAME, APP_VERSION } from "@/config/app";
import { useI18n, type Language } from "@/i18n";
import { useThemePreference, type ThemeMode } from "@/theme";
import { toast } from "sonner";
import {
  getDefaultPushPreferences,
  getExistingPushSubscription,
  getPushPermission,
  hasVapidPublicKey,
  isHttpsOrLocalhost,
  isPushSupported,
  loadPushPreferences,
  sendTestPush,
  subscribeToPush,
  unsubscribeFromPush,
  updatePushPreferences,
  type PushPreferences,
} from "@/lib/push";
import { canManageHousehold } from "@/lib/permissions";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function SettingsPage() {
  return (
    <RequireAuth>
      {({ userId, householdId }) => <Inner userId={userId} householdId={householdId} />}
    </RequireAuth>
  );
}

function Inner({ userId, householdId }: { userId: string; householdId: string }) {
  const navigate = useNavigate();
  const { language, setLanguage, t } = useI18n();
  const { theme, setTheme } = useThemePreference();
  const { data: memberships } = useMyHouseholds(userId);
  const profileQ = useQuery({
    queryKey: ["profile", userId],
    queryFn: () => getMyProfileFn({ data: { userId } }),
  });
  const householdQ = useQuery({
    queryKey: ["household", householdId],
    queryFn: () => getHouseholdFn({ data: { householdId } }),
  });

  const doSignOut = async () => {
    await signOut();
    navigate({ to: "/login", replace: true });
  };

  return (
    <AppShell title={t("settings")}>
      <div className="bg-card border border-border rounded-2xl p-4 mb-4">
        <div className="text-xs text-muted-foreground">
          {language === "en" ? "Account" : "Konto"}
        </div>
        <div className="font-medium">{profileQ.data?.display_name ?? "—"}</div>
        <div className="text-sm text-muted-foreground">{profileQ.data?.email}</div>
      </div>
      <div className="bg-card border border-border rounded-2xl p-4 mb-4">
        <div className="text-xs text-muted-foreground">{t("activeHousehold")}</div>
        <div className="font-medium">{householdQ.data?.name ?? "—"}</div>
      </div>
      <div className="bg-card border border-border rounded-2xl p-4 mb-4">
        <div className="font-medium">{APP_NAME}</div>
        <div className="text-sm text-muted-foreground">Version: {APP_VERSION}</div>
        <div className="text-sm text-muted-foreground">{APP_AUTHOR_TEXT}</div>
      </div>
      <section className="bg-card border border-border rounded-2xl p-4 mb-4">
        <h2 className="font-medium">{t("look")}</h2>
        <div className="mt-3 text-sm text-muted-foreground">{t("appTheme")}:</div>
        <SegmentedControl
          value={theme}
          options={[
            { value: "auto", label: t("auto") },
            { value: "light", label: t("light") },
            { value: "dark", label: t("dark") },
          ]}
          onChange={(value) => setTheme(value as ThemeMode)}
        />
      </section>
      <section className="bg-card border border-border rounded-2xl p-4 mb-4">
        <h2 className="font-medium">{t("appLanguage")}:</h2>
        <SegmentedControl
          value={language}
          options={[
            { value: "pl", label: t("polish") },
            { value: "en", label: t("english") },
          ]}
          onChange={(value) => setLanguage(value as Language)}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          {language === "en"
            ? "This preference is saved locally on this device."
            : "Ten wybór zapisuje się lokalnie na tym urządzeniu."}
        </p>
      </section>

      <PushSettings
        householdId={householdId}
        canSendTest={canManageHousehold(
          memberships?.find((m) => m.household_id === householdId)?.role,
        )}
      />
      <ul className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden mb-4">
        <Row
          to="/household"
          icon={<HomeIcon className="w-5 h-5" />}
          label={t("householdMembers")}
        />
        {memberships && memberships.length > 1 && (
          <Row
            to="/select-household"
            icon={<HomeIcon className="w-5 h-5" />}
            label={t("changeActiveHousehold")}
          />
        )}
        <Row to="/stores" icon={<Store className="w-5 h-5" />} label={t("stores")} />
        <Row to="/receipts" icon={<ReceiptText className="w-5 h-5" />} label={t("receipts")} />
        <Row to="/about" icon={<Info className="w-5 h-5" />} label={t("about")} />
        <Row to="/privacy" icon={<Shield className="w-5 h-5" />} label={t("privacy")} />
      </ul>
      <button
        onClick={doSignOut}
        className="w-full py-3 rounded-2xl border border-destructive/30 text-destructive font-medium flex items-center justify-center gap-2"
      >
        <LogOut className="w-4 h-4" /> {t("logout")}
      </button>
      <BrandFooter className="mt-6" />
    </AppShell>
  );
}

function Row({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <li>
      <Link to={to} className="flex items-center gap-3 px-4 py-3.5">
        <span className="text-muted-foreground">{icon}</span>
        <span className="flex-1 text-sm font-medium">{label}</span>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </Link>
    </li>
  );
}

function PushSettings({
  householdId,
  canSendTest,
}: {
  householdId: string;
  canSendTest?: boolean;
}) {
  const { t, language } = useI18n();
  const isEnglish = language === "en";
  const [supported, setSupported] = useState(false);
  const [httpsOk, setHttpsOk] = useState(false);
  const [vapidOk, setVapidOk] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "unsupported",
  );
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preferences, setPreferences] = useState<Required<PushPreferences>>(
    getDefaultPushPreferences(),
  );

  const refresh = useCallback(async () => {
    const nextSupported = isPushSupported();
    setSupported(nextSupported);
    setHttpsOk(isHttpsOrLocalhost());
    setVapidOk(hasVapidPublicKey());
    setPermission(getPushPermission());
    if (!nextSupported) return;
    const subscription = await getExistingPushSubscription();
    setSubscribed(!!subscription);
    if (subscription) setPreferences(await loadPushPreferences(householdId));
  }, [householdId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = async () => {
    setBusy(true);
    try {
      await subscribeToPush(householdId, preferences);
      await refresh();
      toast.success(t("pushEnabledSuccess"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : isEnglish
            ? "Could not enable notifications"
            : "Nie udało się włączyć powiadomień",
      );
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await unsubscribeFromPush(householdId);
      await refresh();
      toast.success(t("pushDisabledSuccess"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : isEnglish
            ? "Could not disable notifications"
            : "Nie udało się wyłączyć powiadomień",
      );
    } finally {
      setBusy(false);
    }
  };

  const togglePreference = async (key: keyof PushPreferences) => {
    const next = { ...preferences, [key]: !preferences[key] };
    setPreferences(next as Required<PushPreferences>);
    if (!subscribed) return;
    try {
      await updatePushPreferences(householdId, next);
      toast.success(t("pushPrefsSaved"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : isEnglish
            ? "Could not save preferences"
            : "Nie udało się zapisać preferencji",
      );
    }
  };

  const sendTest = async () => {
    console.log("[push-test] clicked", { householdId, subscribed, httpsOk, vapidOk });
    setBusy(true);
    try {
      const result = await sendTestPush(householdId);
      console.log("[push-test] success", result);
      toast.success(
        isEnglish
          ? `Test notification sent (${result.sent} device(s))`
          : `Testowe powiadomienie wysłane (${result.sent} urządz.)`,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn("[push-test] failed", msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const statusText = !supported
    ? t("pushUnsupported")
    : subscribed
      ? t("pushSubscribed")
      : permission === "denied"
        ? t("pushDenied")
        : permission === "granted"
          ? t("pushGranted")
          : t("pushDefault");

  return (
    <section className="bg-card border border-border rounded-2xl p-4 mb-4">
      <div className="flex items-start gap-3">
        <Bell className="w-5 h-5 text-muted-foreground mt-0.5" />
        <div className="flex-1">
          <h2 className="font-medium">{t("notifications")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("pushStatus")}: {statusText}
          </p>
          {!httpsOk && (
            <p className="mt-1 text-xs text-destructive font-medium">
              {isEnglish
                ? "Push notifications require HTTPS or localhost."
                : "Powiadomienia push wymagają HTTPS lub localhost."}
            </p>
          )}
          {httpsOk && !vapidOk && (
            <p className="mt-1 text-xs text-destructive font-medium">
              {isEnglish
                ? "VITE_VAPID_PUBLIC_KEY is not set. Contact the administrator."
                : "Brakuje VITE_VAPID_PUBLIC_KEY. Skontaktuj się z administratorem."}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">{t("pushHttpsHint")}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={enable}
          disabled={busy || !supported || subscribed}
          className="rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {t("enableNotifications")}
        </button>
        <button
          type="button"
          onClick={disable}
          disabled={busy || !subscribed}
          className="rounded-xl border border-border px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          {t("disableNotifications")}
        </button>
      </div>
      <div className="mt-4 space-y-2">
        <div className="text-sm font-medium">{t("notificationPrefs")}</div>
        <PreferenceRow
          label={t("notifyItemAdded")}
          checked={preferences.item_added}
          onToggle={() => togglePreference("item_added")}
        />
        <PreferenceRow
          label={t("notifyItemBought")}
          checked={preferences.item_bought}
          onToggle={() => togglePreference("item_bought")}
        />
        <PreferenceRow
          label={t("notifyShoppingFinished")}
          checked={preferences.shopping_finished}
          onToggle={() => togglePreference("shopping_finished")}
        />
        <PreferenceRow
          label={t("notifyHouseholdAdded")}
          checked={preferences.household_added}
          onToggle={() => togglePreference("household_added")}
        />
        <PreferenceRow
          label={t("notifyReminders")}
          checked={preferences.reminders}
          onToggle={() => togglePreference("reminders")}
        />
      </div>
      {canSendTest && (
        <button
          type="button"
          onClick={sendTest}
          disabled={busy || !subscribed}
          className="mt-3 w-full rounded-xl border border-border px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          {t("sendTestNotification")}
        </button>
      )}
    </section>
  );
}

function PreferenceRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2 text-sm">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-4 w-4 accent-primary"
      />
    </label>
  );
}

function SegmentedControl({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div
      className="mt-2 grid gap-2"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-muted text-foreground"
            }`}
            aria-pressed={selected}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
