import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { BrandFooter } from "@/components/Brand";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/", replace: true });
  }, [user, loading, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: name || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Konto utworzone! Możesz się zalogować.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Coś poszło nie tak");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background px-5 py-10">
      <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
        <div className="text-center mb-8">
          <div className="text-5xl mb-2">🛒</div>
          <h1 className="text-3xl font-bold tracking-tight">Zakupy Razem</h1>
          <p className="text-muted-foreground mt-1 text-sm">Wspólna lista zakupów dla rodziny</p>
        </div>
        <form onSubmit={submit} className="bg-card rounded-3xl border border-border p-5 shadow-sm space-y-3">
          <div className="flex bg-muted rounded-full p-1 text-sm font-medium">
            <button type="button" onClick={() => setMode("signin")} className={`flex-1 py-2 rounded-full ${mode === "signin" ? "bg-card shadow" : "text-muted-foreground"}`}>Logowanie</button>
            <button type="button" onClick={() => setMode("signup")} className={`flex-1 py-2 rounded-full ${mode === "signup" ? "bg-card shadow" : "text-muted-foreground"}`}>Rejestracja</button>
          </div>
          {mode === "signup" && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Imię"
              className="w-full px-4 py-3 rounded-2xl bg-background border border-border"
            />
          )}
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mail"
            className="w-full px-4 py-3 rounded-2xl bg-background border border-border"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Hasło"
            className="w-full px-4 py-3 rounded-2xl bg-background border border-border"
          />
          <button
            disabled={busy}
            className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold disabled:opacity-60"
          >
            {busy ? "Czekaj…" : mode === "signin" ? "Zaloguj się" : "Załóż konto"}
          </button>
        </form>
        <div className="text-center mt-6 space-y-2">
          <Link to="/privacy" className="text-sm text-muted-foreground underline">Polityka prywatności</Link>
          <BrandFooter className="pt-2" />
        </div>
      </div>
    </div>
  );
}