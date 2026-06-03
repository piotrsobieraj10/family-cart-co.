import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { RequireAuth } from "@/pages/RequireAuth";
import { supabase } from "@/integrations/supabase/client";
import { setActiveHouseholdId } from "@/lib/household";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/onboarding")({ component: OnboardingPage });

function OnboardingPage() {
  return (
    <RequireAuth requireHousehold={false}>{({ userId }) => <Inner userId={userId} />}</RequireAuth>
  );
}

function Inner({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { language } = useI18n();
  const isEnglish = language === "en";
  const [name, setName] = useState("Dom");
  const [busy, setBusy] = useState(false);
  const [finalizing, setFinalizing] = useState(true);
  const attemptedFinalization = useRef(false);

  useEffect(() => {
    if (attemptedFinalization.current) return;
    attemptedFinalization.current = true;

    void (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("finalize-registration");
        if (error) throw error;

        if (data?.household_id) {
          setActiveHouseholdId(data.household_id);
          await qc.invalidateQueries({ queryKey: ["my-households"] });
          if (data.created) {
            toast.success(
              isEnglish
                ? `Created household: ${data.household_name}. You are this group's administrator.`
                : `Utworzono dom: ${data.household_name}. Jesteś administratorem tej grupy.`,
            );
          }
          navigate({ to: "/", replace: true });
          return;
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : isEnglish
              ? "Could not finish registration"
              : "Nie udało się dokończyć rejestracji",
        );
      }
      setFinalizing(false);
    })();
  }, [isEnglish, navigate, qc]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data: hh, error } = await supabase
        .from("households")
        .insert({ name: name.trim() || "Dom", owner_id: userId })
        .select("id")
        .single();
      if (error) throw error;
      const { error: memErr } = await supabase.from("household_members").insert({
        household_id: hh.id,
        user_id: userId,
        role: "owner",
        status: "active",
        created_by: userId,
      });
      if (memErr) throw memErr;
      setActiveHouseholdId(hh.id);
      await qc.invalidateQueries({ queryKey: ["my-households"] });
      navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : isEnglish ? "Error" : "Błąd");
    } finally {
      setBusy(false);
    }
  };

  if (finalizing) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        {isEnglish ? "Finishing registration…" : "Kończę rejestrację…"}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col px-5 py-10">
      <div className="max-w-md mx-auto w-full flex-1 flex flex-col justify-center">
        <div className="text-center mb-6">
          <div className="text-5xl mb-2">🏠</div>
          <h1 className="text-2xl font-bold">
            {isEnglish ? "Create your household" : "Utwórz swój dom"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isEnglish
              ? "All household members will see shared shopping lists."
              : "Wszyscy domownicy zobaczą wspólne listy zakupów."}
          </p>
        </div>
        <form onSubmit={create} className="bg-card rounded-3xl border border-border p-5 space-y-3">
          <label className="text-sm font-medium">
            {isEnglish ? "Household name" : "Nazwa domu"}
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isEnglish ? "e.g. Smith family" : "np. Rodzina Kowalskich"}
            className="w-full px-4 py-3 rounded-2xl bg-background border border-border"
          />
          <button
            disabled={busy}
            className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold disabled:opacity-60"
          >
            {busy
              ? isEnglish
                ? "Creating…"
                : "Tworzę…"
              : isEnglish
                ? "Create household"
                : "Utwórz dom"}
          </button>
        </form>
      </div>
    </div>
  );
}
