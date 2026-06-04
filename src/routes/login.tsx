import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { BrandFooter } from "@/components/Brand";
import { toast } from "sonner";
import { clearActiveHouseholdId } from "@/lib/household";
import { APP_NAME } from "@/config/app";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/login")({ component: LoginPage });

type RegistrationMode = "open" | "invite_code" | "disabled";

const registrationModeValue = import.meta.env.VITE_REGISTRATION_MODE ?? "open";
const REGISTRATION_MODE: RegistrationMode = ["open", "invite_code", "disabled"].includes(
  registrationModeValue,
)
  ? (registrationModeValue as RegistrationMode)
  : "disabled";
const EMAIL_CONFIRMATION_REQUIRED =
  (import.meta.env.VITE_EMAIL_CONFIRMATION_REQUIRED ?? "true") === "true";

function LoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { t, language } = useI18n();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [signupSubmitted, setSignupSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/", replace: true });
  }, [user, loading, navigate]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        console.log("[auth] register clicked", { email: email.trim(), mode: REGISTRATION_MODE });
        if (REGISTRATION_MODE === "disabled") {
          toast.error(
            "Rejestracja jest obecnie wyłączona. Poproś administratora domu o dodanie konta.",
          );
          return;
        }
        if (!firstName.trim() || !householdName.trim()) {
          toast.error("Podaj imię i nazwę domu");
          return;
        }
        if (password !== repeatPassword) {
          toast.error("Hasła nie są takie same");
          return;
        }

        console.log("[auth] invoking register-user edge function");
        const { data, error } = await supabase.functions.invoke("register-user", {
          body: {
            first_name: firstName.trim(),
            email,
            password,
            household_name: householdName.trim(),
            invite_code: REGISTRATION_MODE === "invite_code" ? inviteCode.trim() : null,
          },
        });
        if (error) {
          console.error("[auth] register error:", error.message);
          throw error;
        }
        if (!data?.ok) {
          console.error("[auth] register failed:", data?.message);
          toast.error(data?.message ?? "Nie udało się utworzyć konta.");
          return;
        }

        console.log("[auth] register success");
        clearActiveHouseholdId();
        setSignupSubmitted(true);
        toast.success(data.message);
      } else {
        console.log("[auth] login clicked", { host: new URL(supabase.supabaseUrl).hostname });
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          console.error("[auth] login error:", error.message);
          if (error.message.toLocaleLowerCase().includes("email not confirmed")) {
            toast.error("Potwierdź adres e-mail, aby korzystać z aplikacji.");
            return;
          }
          throw error;
        }
        console.log("[auth] login success");
        clearActiveHouseholdId();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Coś poszło nie tak");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background px-5 py-10">
      <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
        <div className="text-center mb-8">
          <div className="text-5xl mb-2">🛒</div>
          <h1 className="text-3xl font-bold tracking-tight">{APP_NAME}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t("appDescription")}</p>
        </div>

        {signupSubmitted ? (
          <div className="bg-card rounded-3xl border border-border p-5 shadow-sm text-center space-y-3">
            <h2 className="text-xl font-semibold">{t("checkEmail")}</h2>
            <p className="text-sm text-muted-foreground">{t("checkEmailBody")}</p>
            <button
              onClick={() => {
                setSignupSubmitted(false);
                setMode("signin");
              }}
              className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold"
            >
              {t("goToLogin")}
            </button>
          </div>
        ) : (
          <form
            onSubmit={submit}
            className="bg-card rounded-3xl border border-border p-5 shadow-sm space-y-3"
          >
            <div className="flex bg-muted rounded-full p-1 text-sm font-medium">
              <button
                type="button"
                onClick={() => setMode("signin")}
                className={`flex-1 py-2 rounded-full ${
                  mode === "signin" ? "bg-card shadow" : "text-muted-foreground"
                }`}
              >
                {t("login")}
              </button>
              {REGISTRATION_MODE !== "disabled" && (
                <button
                  type="button"
                  onClick={() => setMode("signup")}
                  className={`flex-1 py-2 rounded-full ${
                    mode === "signup" ? "bg-card shadow" : "text-muted-foreground"
                  }`}
                >
                  {t("register")}
                </button>
              )}
            </div>

            {mode === "signup" && (
              <>
                <input
                  required
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  placeholder={t("firstName")}
                  className="w-full px-4 py-3 rounded-2xl bg-background border border-border"
                />
                <input
                  required
                  value={householdName}
                  onChange={(event) => setHouseholdName(event.target.value)}
                  placeholder={t("householdName")}
                  className="w-full px-4 py-3 rounded-2xl bg-background border border-border"
                />
              </>
            )}

            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="E-mail"
              className="w-full px-4 py-3 rounded-2xl bg-background border border-border"
            />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("password")}
              className="w-full px-4 py-3 rounded-2xl bg-background border border-border"
            />

            {mode === "signup" && (
              <>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={repeatPassword}
                  onChange={(event) => setRepeatPassword(event.target.value)}
                  placeholder={t("repeatPassword")}
                  className="w-full px-4 py-3 rounded-2xl bg-background border border-border"
                />
                {REGISTRATION_MODE === "invite_code" && (
                  <input
                    required
                    value={inviteCode}
                    onChange={(event) => setInviteCode(event.target.value)}
                    placeholder={t("inviteCode")}
                    className="w-full px-4 py-3 rounded-2xl bg-background border border-border"
                  />
                )}
                {EMAIL_CONFIRMATION_REQUIRED && (
                  <p className="text-xs text-muted-foreground px-1">
                    {language === "en"
                      ? "After registration we will send a link to confirm your email address."
                      : "Po rejestracji wyślemy link do potwierdzenia adresu e-mail."}
                  </p>
                )}
              </>
            )}

            <button
              disabled={busy}
              className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold disabled:opacity-60"
            >
              {busy ? t("wait") : mode === "signin" ? t("loginCta") : t("registerCta")}
            </button>
          </form>
        )}

        {REGISTRATION_MODE === "disabled" && !signupSubmitted && (
          <p className="text-sm text-muted-foreground text-center mt-4">
            {language === "en"
              ? "Registration is currently disabled. Ask a household administrator to add your account."
              : "Rejestracja jest obecnie wyłączona. Poproś administratora domu o dodanie konta."}
          </p>
        )}

        <div className="text-center mt-6 space-y-2">
          <Link to="/privacy" className="text-sm text-muted-foreground underline">
            {t("privacy")}
          </Link>
          <BrandFooter className="pt-2" />
        </div>
      </div>
    </div>
  );
}
