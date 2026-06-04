import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/pages/RequireAuth";
import {
  canManageHousehold,
  canManageMembers,
  ROLE_LABELS,
  type HouseholdRole,
} from "@/lib/permissions";
import { toast } from "sonner";
import { Crown, Trash2 } from "lucide-react";
import { useI18n } from "@/i18n";
import { notifyHousehold } from "@/lib/push";
import {
  getHouseholdFn,
  getHouseholdMembersFn,
  removeMemberFn,
  addHouseholdMemberFn,
  renameHouseholdFn,
  changeRoleFn,
} from "@/lib/api/data.functions";

export const Route = createFileRoute("/household")({ component: HouseholdPage });

function HouseholdPage() {
  return (
    <RequireAuth>
      {({ householdId, userId, role }) => (
        <Inner householdId={householdId} userId={userId} role={role} />
      )}
    </RequireAuth>
  );
}

function Inner({
  householdId,
  userId,
  role,
}: {
  householdId: string;
  userId: string;
  role?: HouseholdRole;
}) {
  const qc = useQueryClient();
  const { language } = useI18n();
  const isEnglish = language === "en";
  const [email, setEmail] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [newRole, setNewRole] = useState<Exclude<HouseholdRole, "owner">>("member");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const householdQ = useQuery({
    queryKey: ["household", householdId],
    queryFn: () => getHouseholdFn({ data: { householdId } }),
  });

  const membersQ = useQuery({
    queryKey: ["members", householdId],
    queryFn: () => getHouseholdMembersFn({ data: { householdId } }),
  });

  const canManage = canManageMembers(role);

  const renameHousehold = async () => {
    const nextName = prompt(
      isEnglish ? "New household name" : "Nowa nazwa domu",
      householdQ.data?.name ?? "",
    );
    if (!nextName?.trim()) return;
    try {
      await renameHouseholdFn({ data: { householdId, name: nextName.trim() } });
      toast.success(isEnglish ? "Household name changed" : "Zmieniono nazwę domu");
      qc.invalidateQueries({ queryKey: ["household", householdId] });
      qc.invalidateQueries({ queryKey: ["my-households"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd");
    }
  };

  const addMember = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await addHouseholdMemberFn({
        data: {
          household_id: householdId,
          email: email.trim().toLowerCase(),
          temporary_password: temporaryPassword,
          role: newRole,
          label: label.trim() || null,
        },
      });
      if (data?.ok === false) {
        toast.error(data.error ?? (isEnglish ? "Could not add user" : "Nie udało się dodać użytkownika"));
        return;
      }
      if (data?.code === "already_member") {
        toast.error(isEnglish ? "This user already belongs to this group" : "Ten użytkownik już należy do tej grupy");
        return;
      }
      toast.success(
        data?.created
          ? isEnglish ? "New account created with a temporary password" : "Nowe konto zostało utworzone z hasłem tymczasowym"
          : isEnglish ? "User exists — added to this group without changing password" : "Użytkownik istnieje — dodano go do tej grupy bez zmiany hasła",
      );
      if (data?.user_id) {
        void notifyHousehold({ householdId, type: "household_added", body: isEnglish ? `Added user: ${email.trim()}` : `Dodano użytkownika: ${email.trim()}`, url: "/household" });
      }
      if (data?.created) toast.info(isEnglish ? "On first sign-in the user will change the password and complete details" : "Przy pierwszym logowaniu użytkownik zmieni hasło i uzupełni dane");
      setEmail(""); setTemporaryPassword(""); setLabel("");
      await qc.invalidateQueries({ queryKey: ["members", householdId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : isEnglish ? "Could not add user" : "Nie udało się dodać użytkownika");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (memberId: string) => {
    if (!confirm(isEnglish ? "Remove this person from the household?" : "Usunąć tę osobę z domu?")) return;
    try {
      await removeMemberFn({ data: { householdId, memberId } });
      toast.success(isEnglish ? "User removed from group" : "Usunięto użytkownika z grupy");
      qc.invalidateQueries({ queryKey: ["members", householdId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd");
    }
  };

  const changeRole = async (memberId: string, nextRole: HouseholdRole) => {
    try {
      await changeRoleFn({ data: { householdId, memberId, role: nextRole } });
      toast.success(isEnglish ? "Role changed" : "Zmieniono rolę");
      qc.invalidateQueries({ queryKey: ["members", householdId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd");
    }
  };

  return (
    <AppShell title={householdQ.data?.name ?? (isEnglish ? "Household / Users" : "Dom / Użytkownicy")}>
      {canManageHousehold(role) && (
        <button onClick={renameHousehold} className="w-full mb-3 py-2.5 rounded-2xl border border-border bg-card text-sm font-medium">
          {isEnglish ? "Change household name" : "Zmień nazwę domu"}
        </button>
      )}
      {canManage && (
        <form onSubmit={addMember} className="bg-card border border-border rounded-2xl p-4 mb-4 space-y-3">
          <div>
            <h2 className="font-semibold">{isEnglish ? "Add user" : "Dodaj użytkownika"}</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {isEnglish ? "One email address means one account, which can belong to many households." : "Jeden adres e-mail oznacza jedno konto, które może należeć do wielu domów."}
            </p>
          </div>
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={isEnglish ? "Email address" : "Adres e-mail"} className="w-full px-4 py-3 rounded-2xl bg-background border border-border" />
          <div className="space-y-1">
            <input minLength={6} type="password" value={temporaryPassword} onChange={(e) => setTemporaryPassword(e.target.value)} placeholder={isEnglish ? "Temporary password for a new account" : "Hasło tymczasowe dla nowego konta"} className="w-full px-4 py-3 rounded-2xl bg-background border border-border" />
            <p className="text-xs text-muted-foreground px-1">{isEnglish ? "Required only if this email does not exist in Family Cart yet." : "Wymagane tylko wtedy, gdy ten e-mail nie istnieje jeszcze w Family Cart."}</p>
          </div>
          <select value={newRole} onChange={(e) => setNewRole(e.target.value as Exclude<HouseholdRole, "owner">)} className="w-full px-4 py-3 rounded-2xl bg-background border border-border">
            <option value="admin">Administrator</option>
            <option value="member">{isEnglish ? "User" : "Użytkownik"}</option>
            <option value="viewer">{isEnglish ? "View only" : "Podgląd"}</option>
          </select>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={isEnglish ? "Short label, e.g. partner (optional)" : "Krótka nazwa, np. żona (opcjonalnie)"} className="w-full px-4 py-3 rounded-2xl bg-background border border-border" />
          <button disabled={busy} className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold disabled:opacity-60">
            {busy ? (isEnglish ? "Adding…" : "Dodaję…") : (isEnglish ? "Add user" : "Dodaj użytkownika")}
          </button>
        </form>
      )}

      <h2 className="font-semibold mb-2 px-1">{isEnglish ? "Members" : "Członkowie"}</h2>
      <ul className="space-y-2">
        {(membersQ.data ?? []).map((member) => {
          const isOwner = member.role === "owner";
          return (
            <li key={member.id} className="bg-card border border-border rounded-2xl p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold">
                {(member.display_name ?? member.email ?? "?").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate flex items-center gap-1.5">
                  {member.display_name ?? member.email}
                  {isOwner && <Crown className="w-4 h-4 text-accent" />}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {member.email}{member.label ? ` · ${member.label}` : ""}
                </div>
                {canManage && !isOwner ? (
                  <select value={member.role} onChange={(e) => changeRole(member.id, e.target.value as HouseholdRole)} className="mt-1 text-xs bg-transparent text-muted-foreground">
                    <option value="admin">Administrator</option>
                    <option value="member">{isEnglish ? "User" : "Użytkownik"}</option>
                    <option value="viewer">{isEnglish ? "View only" : "Podgląd"}</option>
                  </select>
                ) : (
                  <div className="text-xs text-muted-foreground mt-1">{isEnglish ? labelRole(member.role as HouseholdRole) : ROLE_LABELS[member.role as HouseholdRole]}</div>
                )}
              </div>
              {canManage && member.user_id !== userId && !isOwner && (
                <button onClick={() => remove(member.id)} className="text-destructive p-2" aria-label={isEnglish ? "Remove user" : "Usuń użytkownika"}>
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </AppShell>
  );
}

function labelRole(role: HouseholdRole) {
  switch (role) {
    case "owner": return "Owner";
    case "admin": return "Administrator";
    case "member": return "User";
    case "viewer": return "View only";
  }
}
