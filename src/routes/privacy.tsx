import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({ component: PrivacyPage });

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 bg-background/90 backdrop-blur border-b border-border">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center">
          <Link to="/login" className="text-sm text-muted-foreground">← Wróć</Link>
          <h1 className="ml-3 text-lg font-semibold">Polityka prywatności</h1>
        </div>
      </header>
      <main className="max-w-md mx-auto px-5 py-6 prose prose-sm space-y-4 text-foreground">
        <p>Aplikacja <strong>Zakupy Razem</strong> służy do prowadzenia wspólnej listy zakupów dla członków jednego domu lub rodziny.</p>
        <h2 className="font-semibold mt-4">Jakie dane przetwarzamy</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Dane konta: adres e-mail, imię (jeśli podane), hasło w zaszyfrowanej formie.</li>
          <li>Dane domu/grupy: nazwa, lista członków.</li>
          <li>Listy zakupów i produkty: nazwa, ilość, jednostka, kategoria, notatka, status, kto dodał i odhaczył produkt.</li>
          <li>Zdjęcia produktów: konwertowane do formatu WebP i przechowywane w bezpiecznym storage.</li>
          <li>Historia aktywności w obrębie domu (kto co dodał, kupił, oznaczył).</li>
        </ul>
        <h2 className="font-semibold mt-4">Kto widzi Twoje dane</h2>
        <p>Listy, produkty, zdjęcia i historia są widoczne wyłącznie dla aktywnych członków danego domu. Dostęp jest egzekwowany na poziomie bazy danych (Row Level Security).</p>
        <h2 className="font-semibold mt-4">Przechowywanie i dostawcy</h2>
        <p>Aplikacja korzysta z usługi Lovable Cloud (Supabase) do uwierzytelniania, bazy danych i storage zdjęć. Oryginalne zdjęcia nie są przechowywane – zapisujemy jedynie skompresowane wersje WebP (miniatura i podgląd).</p>
        <h2 className="font-semibold mt-4">Twoje prawa</h2>
        <p>Możesz w każdej chwili poprosić o usunięcie konta wraz ze wszystkimi powiązanymi danymi. Aplikacja nie sprzedaje danych użytkowników osobom trzecim.</p>
        <p className="text-xs text-muted-foreground pt-6">Stworzone przez AutoSafe.</p>
      </main>
    </div>
  );
}