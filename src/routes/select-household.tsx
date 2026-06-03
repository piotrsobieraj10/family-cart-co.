import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RequireAuth } from "@/pages/RequireAuth";
import { useMyHouseholds, setActiveHouseholdId } from "@/lib/household";
import { ROLE_LABELS } from "@/lib/permissions";
import { useI18n } from "@/i18n";

export const Route = createFileRoute("/select-household")({ component: SelectHouseholdPage });

function SelectHouseholdPage() {
  return (
    <RequireAuth requireHousehold={false}>{({ userId }) => <Inner userId={userId} />}</RequireAuth>
  );
}

function Inner({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const { data: memberships } = useMyHouseholds(userId);
  const { language, t } = useI18n();
  const isEnglish = language === "en";

  const choose = (householdId: string) => {
    setActiveHouseholdId(householdId);
    navigate({ to: "/", replace: true });
  };

  return (
    <div className="min-h-screen bg-background px-5 py-10">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold">{t("chooseHousehold")}</h1>
        <p className="text-sm text-muted-foreground mt-1 mb-5">
          {isEnglish
            ? "Data for each household is fully separated."
            : "Dane każdego domu są całkowicie oddzielne."}
        </p>
        <div className="space-y-3">
          {memberships?.map((membership) => (
            <button
              key={membership.household_id}
              onClick={() => choose(membership.household_id)}
              className="w-full text-left bg-card border border-border rounded-2xl p-4 active:scale-[0.99]"
            >
              <div className="font-semibold">
                {membership.households?.name ?? (isEnglish ? "Household" : "Dom")}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {ROLE_LABELS[membership.role]}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
