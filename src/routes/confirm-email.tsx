import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandFooter } from "@/components/Brand";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/confirm-email")({ component: ConfirmEmailPage });

function ConfirmEmailPage() {
  const { language } = useI18n();
  const isEnglish = language === "en";
  return (
    <div className="min-h-screen flex flex-col bg-background px-5 py-10">
      <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full text-center">
        <div className="bg-card rounded-3xl border border-border p-5 shadow-sm space-y-3">
          <h1 className="text-2xl font-bold">
            {isEnglish ? "Confirm your email address" : "Potwierdź adres e-mail"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isEnglish
              ? "Confirm your email address to use the app."
              : "Potwierdź adres e-mail, aby korzystać z aplikacji."}
          </p>
          <Link
            to="/login"
            className="block w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold"
          >
            {isEnglish ? "Back to sign in" : "Wróć do logowania"}
          </Link>
        </div>
        <BrandFooter className="mt-6" />
      </div>
    </div>
  );
}
