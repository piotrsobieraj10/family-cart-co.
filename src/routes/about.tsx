import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { AppIdentity, BrandFooter } from "@/components/Brand";
import { APP_DESCRIPTION, APP_NAME } from "@/config/app";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/about")({ component: AboutPage });

function AboutPage() {
  const { t, language } = useI18n();
  return (
    <AppShell title={t("about")}>
      <div className="text-center py-6">
        <div className="text-5xl mb-2">🛒</div>
        <AppIdentity />
      </div>
      <p className="text-sm text-foreground/80 leading-relaxed">
        {language === "en"
          ? `${APP_NAME} is ${t("appDescription").toLocaleLowerCase()}.`
          : `${APP_NAME} to ${APP_DESCRIPTION.toLocaleLowerCase()}`}
      </p>
      <div className="mt-6 grid gap-3">
        <Link
          to="/privacy"
          className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-center"
        >
          {t("privacy")}
        </Link>
        <Link
          to="/whats-new"
          className="w-full py-3 rounded-2xl border border-border font-semibold text-center"
        >
          {t("whatsNew")}
        </Link>
      </div>
      <BrandFooter className="mt-10" />
    </AppShell>
  );
}
