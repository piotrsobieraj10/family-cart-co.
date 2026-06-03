import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { AppIdentity, BrandFooter } from "@/components/Brand";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/whats-new")({ component: WhatsNewPage });

function WhatsNewPage() {
  const { t } = useI18n();
  return (
    <AppShell title={t("whatsNew")}>
      <div className="bg-card border border-border rounded-2xl p-5">
        <AppIdentity />
        <h2 className="font-semibold mt-6">{t("currentVersion")}</h2>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          {t("currentVersionBody")}
        </p>
      </div>
      <Link
        to="/privacy"
        className="block mt-4 w-full py-3 rounded-2xl border border-border font-semibold text-center"
      >
        {t("privacy")}
      </Link>
      <BrandFooter className="mt-8" />
    </AppShell>
  );
}
