import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { BrandFooter } from "@/components/Brand";

export const Route = createFileRoute("/about")({ component: AboutPage });

function AboutPage() {
  return (
    <AppShell title="O aplikacji">
      <div className="text-center py-6">
        <div className="text-5xl mb-2">🛒</div>
        <h2 className="text-xl font-bold">Zakupy Razem</h2>
        <p className="text-sm text-muted-foreground mt-1">Wersja 1.0.0 (MVP)</p>
      </div>
      <p className="text-sm text-foreground/80 leading-relaxed">
        Zakupy Razem to prosta aplikacja do prowadzenia wspólnej listy zakupów dla rodziny. Jedna osoba dodaje produkty, druga odhacza je w sklepie — wszystko w czasie rzeczywistym.
      </p>
      <div className="mt-6">
        <Link to="/privacy" className="text-sm text-primary underline">Polityka prywatności</Link>
      </div>
      <BrandFooter className="mt-10" />
    </AppShell>
  );
}