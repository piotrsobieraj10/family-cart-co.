import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { RequireAuth } from "@/pages/RequireAuth";
import { setActiveHouseholdId } from "@/lib/household";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { createHouseholdFn } from "@/lib/api/data.functions";

export const Route = createFileRoute("/onboarding")({ component: OnboardingPage });

function OnboardingPage() {
  return (
    <RequireAuth requireHousehold={false}>{({ userId }) => <Inner userId={userId} />}</RequireAuth>
  );
}

function Inner({ userId: _userId }: { userId: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { language } = useI18n();
  const isEnglish = language === "en";
  const [name, setName] = useState("Dom");
  const [busy, setBusy] = useState(false);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await createHouseholdFn({ data: { name: name.trim() || "Dom" } });
      setActiveHouseholdId(result.id);
      await qc.invalidateQueries({ queryKey: ["my-households"] });
      toast.success(
        isEnglish
          ? `Created household: ${name}. You are this group's owner.`
          : `Utworzono dom: ${name}. Jesteś właścicielem tej grupy.`,
      );
      navigate({ to: "/", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (isEnglish ? "Failed to create household" : "Nie udało się utworzyć domu"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background px-5 py-10">
      <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full space-y-6">
        <div className="text-center">
          <div className="text-5xl mb-2">🏠</div>
          <h1 className="text-2xl font-bold">
            {isEnglish ? "Create your household" : "Utwórz swój dom/grupę"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {isEnglish
              ? "Give your household a name to get started."
              : "Podaj nazwę, żeby zacząć korzystać z aplikacji."}
          </p>
        </div>
        <form onSubmit={create} className="space-y-3">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isEnglish ? "Household name" : "Nazwa domu/grupy"}
            className="w-full px-4 py-3 rounded-2xl bg-background border border-border"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold disabled:opacity-60"
          >
            {busy ? (isEnglish ? "Creating…" : "Tworzę…") : (isEnglish ? "Create" : "Utwórz")}
          </button>
        </form>
      </div>
    </div>
  );
}
