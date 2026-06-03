import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/pages/RequireAuth";
import { supabase } from "@/integrations/supabase/client";
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
} from "lucide-react";
import { useMyHouseholds } from "@/lib/household";
import { APP_AUTHOR_TEXT, APP_NAME, APP_VERSION } from "@/config/app";
import { useI18n, type Language } from "@/i18n";
import { useThemePreference, type ThemeMode } from "@/theme";

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
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      return data;
    },
  });
  const householdQ = useQuery({
    queryKey: ["household", householdId],
    queryFn: async () => {
      const { data } = await supabase
        .from("households")
        .select("name")
        .eq("id", householdId)
        .maybeSingle();
      return data;
    },
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
