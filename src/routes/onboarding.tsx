import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { RequireAuth } from "@/pages/RequireAuth";
import { supabase } from "@/integrations/supabase/client";
import { setActiveHouseholdId } from "@/lib/household";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const Route = createFileRoute("/onboarding")({ component: OnboardingPage });

function OnboardingPage() {
  return (
    <RequireAuth requireHousehold={false}>
      {({ userId }) => <Inner userId={userId} />}
    </RequireAuth>
  );
}

function Inner({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("Dom");
  const [busy, setBusy] = useState(false);

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
      const { error: memErr } = await supabase
        .from("household_members")
        .insert({ household_id: hh.id, user_id: userId, role: "admin", status: "active" });
      if (memErr) throw memErr;
      setActiveHouseholdId(hh.id);
      await qc.invalidateQueries({ queryKey: ["my-households"] });
      navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Błąd");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col px-5 py-10">
      <div className="max-w-md mx-auto w-full flex-1 flex flex-col justify-center">
        <div className="text-center mb-6">
          <div className="text-5xl mb-2">🏠</div>
          <h1 className="text-2xl font-bold">Utwórz swój dom</h1>
          <p className="text-muted-foreground text-sm mt-1">Wszyscy domownicy zobaczą wspólne listy zakupów.</p>
        </div>
        <form onSubmit={create} className="bg-card rounded-3xl border border-border p-5 space-y-3">
          <label className="text-sm font-medium">Nazwa domu</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="np. Rodzina Kowalskich"
            className="w-full px-4 py-3 rounded-2xl bg-background border border-border"
          />
          <button disabled={busy} className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold disabled:opacity-60">
            {busy ? "Tworzę…" : "Utwórz dom"}
          </button>
        </form>
      </div>
    </div>
  );
}