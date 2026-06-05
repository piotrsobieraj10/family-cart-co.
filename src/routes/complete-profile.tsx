import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RequireAuth } from "@/pages/RequireAuth";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { updateProfileFn } from "@/lib/api/auth.functions";

export const Route = createFileRoute("/complete-profile")({ component: CompleteProfilePage });

function CompleteProfilePage() {
  return (
    <RequireAuth requireHousehold={false} requireCompleteProfile={false}>
      {({ userId }) => <Inner userId={userId} />}
    </RequireAuth>
  );
}

function Inner({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { language, t } = useI18n();
  const isEnglish = language === "en";
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 6)
      return toast.error(
        isEnglish
          ? "New password must have at least 6 characters"
          : "Nowe hasło musi mieć co najmniej 6 znaków",
      );
    if (password !== repeatPassword)
      return toast.error(isEnglish ? "Passwords do not match" : "Hasła nie są takie same");
    setBusy(true);
    try {
      const result = await updateProfileFn({
        data: {
          userId,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          new_password: password,
          must_complete_profile: false,
          must_change_password: false,
        },
      });
      if (!result.ok) {
        toast.error(
          result.error ?? (isEnglish ? "Could not save details" : "Nie udało się zapisać danych"),
        );
        return;
      }
      await qc.invalidateQueries({ queryKey: ["profile", userId] });
      toast.success(isEnglish ? "Account details completed" : "Dane konta zostały uzupełnione");
      navigate({ to: "/", replace: true });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : isEnglish
            ? "Could not save details"
            : "Nie udało się zapisać danych",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col px-5 py-10">
      <div className="max-w-md mx-auto w-full flex-1 flex flex-col justify-center">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold">
            {isEnglish ? "Complete account details" : "Uzupełnij dane konta"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isEnglish
              ? "Set your details and a new password on first sign-in."
              : "Przy pierwszym logowaniu ustaw swoje dane i nowe hasło."}
          </p>
        </div>
        <form onSubmit={submit} className="bg-card rounded-3xl border border-border p-5 space-y-3">
          <input
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder={t("firstName")}
            className="w-full px-4 py-3 rounded-2xl bg-background border border-border"
          />
          <input
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder={isEnglish ? "Last name" : "Nazwisko"}
            className="w-full px-4 py-3 rounded-2xl bg-background border border-border"
          />
          <input
            required
            minLength={6}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isEnglish ? "New password" : "Nowe hasło"}
            className="w-full px-4 py-3 rounded-2xl bg-background border border-border"
          />
          <input
            required
            minLength={6}
            type="password"
            value={repeatPassword}
            onChange={(e) => setRepeatPassword(e.target.value)}
            placeholder={isEnglish ? "Repeat new password" : "Powtórz nowe hasło"}
            className="w-full px-4 py-3 rounded-2xl bg-background border border-border"
          />
          <button
            disabled={busy}
            className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold disabled:opacity-60"
          >
            {busy
              ? isEnglish
                ? "Saving…"
                : "Zapisuję…"
              : isEnglish
                ? "Save and continue"
                : "Zapisz i przejdź dalej"}
          </button>
        </form>
      </div>
    </div>
  );
}
