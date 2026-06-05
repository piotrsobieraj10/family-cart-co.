import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AppIdentity } from "@/components/Brand";
import { APP_NAME } from "@/config/app";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/privacy")({ component: PrivacyPage });

function PrivacyPage() {
  const { t, language } = useI18n();
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-background/90 backdrop-blur border-b border-border">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center">
          <Link to="/login" className="text-sm text-muted-foreground">
            ← {t("back")}
          </Link>
          <h1 className="ml-3 text-lg font-semibold">{t("privacy")}</h1>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-6 space-y-4">
        <section className="bg-card border border-border rounded-2xl p-5">
          <AppIdentity />
          <div className="mt-4 text-xs text-muted-foreground text-center space-y-1">
            <div>{t("privacyLastUpdated")}</div>
            <div>{t("privacyVersion")}</div>
          </div>
        </section>

        <PrivacySection
          title={language === "en" ? "1. General information" : "1. Informacje ogólne"}
        >
          <p>
            Niniejsza polityka opisuje, jak dane użytkowników są przetwarzane w aplikacji{" "}
            <strong>{APP_NAME}</strong>.
          </p>
          <p>
            Administrator danych: <strong>[UZUPEŁNIJ DANE FIRMY]</strong>
          </p>
          <p>
            Kontakt w sprawach prywatności: <strong>[UZUPEŁNIJ ADRES E-MAIL]</strong>
          </p>
          <p>
            Strona internetowa: <strong>[UZUPEŁNIJ STRONĘ WWW]</strong>
          </p>
        </PrivacySection>

        <PrivacySection
          title={language === "en" ? "2. Accounts and sign-in" : "2. Konta i logowanie"}
        >
          <p>
            Aplikacja może przetwarzać adres e-mail, imię, nazwisko, dane profilu oraz informacje
            potrzebne do logowania. Hasła są obsługiwane przez system uwierzytelniania i nie są
            przechowywane w aplikacji jako jawny tekst.
          </p>
          <p>
            Samodzielna rejestracja może wymagać potwierdzenia adresu e-mail. Użytkownik może też
            otrzymać konto utworzone przez administratora prywatnego domu lub grupy.
          </p>
        </PrivacySection>

        <PrivacySection title="3. Prywatne domy i grupy">
          <p>
            Dane są organizowane w prywatnych domach lub grupach. Jedno konto powiązane z jednym
            adresem e-mail może należeć do kilku domów lub grup.
          </p>
          <p>
            Członkowie widzą dane tylko tych grup, do których mają aktywny dostęp. Role i
            uprawnienia określają, kto może przeglądać, dodawać, edytować lub zarządzać danymi oraz
            użytkownikami danej grupy.
          </p>
        </PrivacySection>

        <PrivacySection title="4. Dane tworzone w aplikacji">
          <p>Aplikacja może przetwarzać:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>listy zakupów, produkty, ilości, jednostki, notatki, statusy i kategorie,</li>
            <li>szybkie listy oraz dane pomocnicze używane do ich przetwarzania,</li>
            <li>zdjęcia produktów, miniatury i podglądy,</li>
            <li>
              sklepy, budżety list, szacowane ceny produktów oraz historię cen zapisaną dla sklepu,
            </li>
            <li>
              zdjęcia paragonów, daty, sklepy, nazwy produktów, ceny, sumy oraz dane pomocnicze do
              dopasowania produktów z paragonu,
            </li>
            <li>historię aktywności, w tym informacje o działaniach członków grupy,</li>
            <li>nazwy domów lub grup, członkostwa, role i uprawnienia.</li>
          </ul>
        </PrivacySection>

        <PrivacySection title="5. Zdjęcia produktów">
          <p>
            Zdjęcia produktów mogą być konwertowane i kompresowane do formatu WebP przed zapisaniem.
            Pozwala to ograniczyć rozmiar plików i transfer danych. W zależności od konfiguracji
            aplikacja może przechowywać miniaturę oraz większą wersję podglądową.
          </p>
        </PrivacySection>

        <PrivacySection title="6. Paragony, OCR i ceny">
          <p>
            Zdjęcia paragonów i powiązane dane są widoczne wyłącznie dla członków odpowiedniego domu
            lub grupy. Mogą być używane do uzupełniania historii cen i dopasowywania nazw z paragonu
            do produktów zapamiętanych w aplikacji.
          </p>
          <p>
            OCR może pomagać w odczytaniu treści paragonu, ale wynik wymaga sprawdzenia i
            potwierdzenia przez użytkownika. Aplikacja nie powinna zapisywać cen z OCR jako
            potwierdzonych bez takiej weryfikacji.
          </p>
          <p>
            Nie należy przesyłać paragonów zawierających dane osobowe, dane płatnicze ani inne
            informacje wrażliwe. Dane paragonów i historii cen nie są sprzedawane.
          </p>
        </PrivacySection>

        <PrivacySection title="7. Powiadomienia push">
          <p>
            Użytkownik może dobrowolnie włączyć powiadomienia push. W tym celu aplikacja może
            przetwarzać techniczne dane subskrypcji urządzenia lub przeglądarki, takie jak endpoint
            push, klucze p256dh/auth, identyfikator użytkownika, identyfikator domu/grupy oraz
            preferencje typów powiadomień.
          </p>
          <p>
            Dane subskrypcji push są używane wyłącznie do wysyłania powiadomień Family Cart, np. o
            dodaniu produktu, zakończeniu zakupów albo zmianach w domu/grupie. Użytkownik może
            wyłączyć powiadomienia w aplikacji lub w ustawieniach przeglądarki/systemu.
          </p>
          <p>
            Powiadomienia są wysyłane tylko w obrębie domu lub grupy, do której użytkownik ma
            aktywny dostęp. Dane techniczne powiadomień nie są sprzedawane.
          </p>
        </PrivacySection>

        <PrivacySection title="8. Cel przetwarzania danych">
          <p>
            Dane są przetwarzane w celu zapewnienia działania konta, logowania, współdzielenia list
            zakupów, zarządzania członkami grup, prezentowania historii aktywności oraz ochrony
            prywatności danych między grupami.
          </p>
        </PrivacySection>

        <PrivacySection title="9. Dostawcy usług">
          <p>
            Aplikacja może korzystać z Supabase jako dostawcy logowania, bazy danych oraz storage
            plików. Dostawcy techniczni przetwarzają dane w zakresie niezbędnym do świadczenia
            swoich usług i zgodnie z własnymi warunkami oraz politykami prywatności.
          </p>
        </PrivacySection>

        <PrivacySection title="10. Udostępnianie i sprzedaż danych">
          <p>
            Dane użytkowników nie są sprzedawane. Dane mogą być udostępniane dostawcom technicznym
            wyłącznie w zakresie potrzebnym do działania aplikacji albo gdy wymagają tego
            obowiązujące przepisy prawa.
          </p>
        </PrivacySection>

        <PrivacySection title="11. Bezpieczeństwo">
          <p>
            Dostęp do danych jest ograniczany przez logowanie, role i uprawnienia w grupie oraz
            mechanizmy bezpieczeństwa bazy danych, w tym Row Level Security (RLS). Celem tych
            zabezpieczeń jest uniemożliwienie dostępu do danych innych domów lub grup.
          </p>
          <p>
            Żaden system nie gwarantuje całkowitego bezpieczeństwa. Użytkownicy powinni chronić
            swoje hasła i nie udostępniać danych logowania innym osobom.
          </p>
        </PrivacySection>

        <PrivacySection title="12. Okres przechowywania danych">
          <p>
            Dane są przechowywane tak długo, jak jest to potrzebne do działania konta, domu lub
            grupy, a następnie mogą zostać usunięte po zakończeniu korzystania z aplikacji lub po
            realizacji uzasadnionego żądania użytkownika.
          </p>
          <p>
            Niektóre dane mogą być przechowywane dłużej, jeżeli wymagają tego przepisy prawa,
            bezpieczeństwo systemu, kopie zapasowe lub zasady dostawców technicznych.
          </p>
        </PrivacySection>

        <PrivacySection title="13. Prawa użytkownika">
          <p>
            Użytkownik może poprosić o dostęp do swoich danych, ich poprawienie, usunięcie,
            ograniczenie przetwarzania lub uzyskać informacje o sposobie ich przetwarzania, w
            zakresie wynikającym z obowiązujących przepisów.
          </p>
          <p>
            Żądania dotyczące prywatności należy kierować na adres:{" "}
            <strong>[UZUPEŁNIJ ADRES E-MAIL]</strong>
          </p>
        </PrivacySection>

        <PrivacySection title="14. Zmiany polityki">
          <p>
            Polityka prywatności może być aktualizowana wraz ze zmianami aplikacji lub wymagań
            prawnych. Aktualna data i wersja polityki są widoczne na początku dokumentu.
          </p>
        </PrivacySection>

        <div className="text-center pt-2 pb-6">
          <Link to="/login" className="text-sm text-primary underline">
            {language === "en" ? "Back to sign in" : "Wróć do logowania"}
          </Link>
        </div>
      </main>
    </div>
  );
}

function PrivacySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-card border border-border rounded-2xl p-5">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-3 text-sm text-foreground/80 leading-relaxed space-y-3">{children}</div>
    </section>
  );
}
