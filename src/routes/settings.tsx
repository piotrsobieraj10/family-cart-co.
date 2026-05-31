import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/pages/RequireAuth";
import { supabase } from "@/integrations/supabase/client";
import { signOut } from "@/lib/auth";
import { BrandFooter } from "@/components/Brand";
import { ChevronRight, LogOut, Info, Shield, Home as HomeIcon } from "lucide-react";

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
  const profileQ = useQuery({
    queryKey: ["profile", userId],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();
      return data;
    },
  });
  const householdQ = useQuery({
    queryKey: ["household", householdId],
    queryFn: async () => {
      const { data } = await supabase.from("households").select("name").eq("id", householdId).maybeSingle();
      return data;
    },
  });

  const doSignOut = async () => {
    await signOut();
    navigate({ to: "/login", replace: true });
  };

  return (
    <AppShell title="Ustawienia">
      <div className="bg-card border border-border rounded-2xl p-4 mb-4">
        <div className="text-xs text-muted-foreground">Konto</div>
        <div className="font-medium">{profileQ.data?.display_name ?? "—"}</div>
        <div className="text-sm text-muted-foreground">{profileQ.data?.email}</div>
      </div>
      <div className="bg-card border border-border rounded-2xl p-4 mb-4">
        <div className="text-xs text-muted-foreground">Aktywny dom</div>
        <div className="font-medium">{householdQ.data?.name ?? "—"}</div>
      </div>
      <ul className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden mb-4">
        <Row to="/household" icon={<HomeIcon className="w-5 h-5" />} label="Członkowie domu" />
        <Row to="/about" icon={<Info className="w-5 h-5" />} label="O aplikacji" />
        <Row to="/privacy" icon={<Shield className="w-5 h-5" />} label="Polityka prywatności" />
      </ul>
      <button onClick={doSignOut} className="w-full py-3 rounded-2xl border border-destructive/30 text-destructive font-medium flex items-center justify-center gap-2">
        <LogOut className="w-4 h-4" /> Wyloguj się
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