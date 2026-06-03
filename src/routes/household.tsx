import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/pages/RequireAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  canManageHousehold,
  canManageMembers,
  ROLE_LABELS,
  type HouseholdRole,
} from "@/lib/permissions";
import { toast } from "sonner";
import { Crown, Trash2 } from "lucide-react";
import { useI18n } from "@/i18n";

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
  const { language, t } = useI18n();
  const isEnglish = language === "en";
  const [email, setEmail] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [newRole, setNewRole] = useState<Exclude<HouseholdRole, "owner">>("member");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  const householdQ = useQuery({
    queryKey: ["household", householdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("households")
        .select("*")
        .eq("id", householdId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const membersQ = useQuery({
    queryKey: ["members", householdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("household_members")
        .select("id, user_id, role, status, label")
        .eq("household_id", householdId)
        .eq("status", "active")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const userIds = useMemo(
    () => membersQ.data?.map((member) => member.user_id) ?? [],
    [membersQ.data],
  );
  const profilesQ = useQuery({
    queryKey: ["member-profiles", householdId, userIds.join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, email")
        .in("user_id", userIds);
      if (error) throw error;
      return data;
    },
  });
  const profiles = new Map(profilesQ.data?.map((profile) => [profile.user_id, profile]));
  const canManage = canManageMembers(role);

  const renameHousehold = async () => {
    const nextName = prompt(
      isEnglish ? "New household name" : "Nowa nazwa domu",
      householdQ.data?.name ?? "",
    );
    if (!nextName?.trim()) return;
    const { error } = await supabase
      .from("households")
      .update({ name: nextName.trim() })
      .eq("id", householdId);
    if (error) return toast.error(error.message);
    toast.success(isEnglish ? "Household name changed" : "Zmieniono nazwę domu");
    qc.invalidateQueries({ queryKey: ["household", householdId] });
    qc.invalidateQueries({ queryKey: ["my-households"] });
  };

  const addMember = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("add-household-user", {
        body: {
          household_id: householdId,
          email: email.trim().toLocaleLowerCase(),
          temporary_password: temporaryPassword,
          role: newRole,
          label: label.trim() || null,
        },
      });
      if (error) throw error;
      if (data?.code === "already_member") {
        toast.error(
          isEnglish
            ? "This user already belongs to this group"
            : "Ten użytkownik już należy do tej grupy",
        );
        return;
      }
      toast.success(
        data?.created
          ? isEnglish
            ? "New account created with a temporary password"
            : "Nowe konto zostało utworzone z hasłem tymczasowym"
          : isEnglish
            ? "User exists - added to this group without changing password"
            : "Użytkownik istnieje — dodano go do tej grupy bez zmiany hasła",
      );
      if (data?.created)
        toast.info(
          isEnglish
            ? "On first sign-in the user will change the password and complete details"
            : "Przy pierwszym logowaniu użytkownik zmieni hasło i uzupełni dane",
        );
      setEmail("");
      setTemporaryPassword("");
      setLabel("");
      await qc.invalidateQueries({ queryKey: ["members", householdId] });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : isEnglish
            ? "Could not add user"
            : "Nie udało się dodać użytkownika",
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async (memberId: string) => {
    if (!confirm(isEnglish ? "Remove this person from the household?" : "Usunąć tę osobę z domu?"))
      return;
    const { error } = await supabase.from("household_members").delete().eq("id", memberId);
    if (error) return toast.error(error.message);
    toast.success(isEnglish ? "User removed from group" : "Usunięto użytkownika z grupy");
    qc.invalidateQueries({ queryKey: ["members", householdId] });
  };

  const changeRole = async (memberId: string, nextRole: HouseholdRole) => {
    const { error } = await supabase
      .from("household_members")
      .update({ role: nextRole })
      .eq("id", memberId);
    if (error) return toast.error(error.message);
    toast.success(isEnglish ? "Role changed" : "Zmieniono rolę");
    qc.invalidateQueries({ queryKey: ["members", householdId] });
  };

  return (
    <AppShell
      title={householdQ.data?.name ?? (isEnglish ? "Household / Users" : "Dom / Użytkownicy")}
    >
      {canManageHousehold(role) && (
        <button
          onClick={renameHousehold}
          className="w-full mb-3 py-2.5 rounded-2xl border border-border bg-card text-sm font-medium"
        >
          {isEnglish ? "Change household name" : "Zmień nazwę domu"}
        </button>
      )}
      {canManage && (
        <form
          onSubmit={addMember}
          className="bg-card border border-border rounded-2xl p-4 mb-4 space-y-3"
        >
          <div>
            <h2 className="font-semibold">{isEnglish ? "Add user" : "Dodaj użytkownika"}</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {isEnglish
                ? "One email address means one account, which can belong to many households."
                : "Jeden adres e-mail oznacza jedno konto, które może należeć do wielu domów."}
            </p>
          </div>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={isEnglish ? "Email address" : "Adres e-mail"}
            className="w-full px-4 py-3 rounded-2xl bg-background border border-border"
          />
          <input
            required
            minLength={6}
            type="password"
            value={temporaryPassword}
            onChange={(e) => setTemporaryPassword(e.target.value)}
            placeholder={isEnglish ? "Temporary password" : "Hasło tymczasowe"}
            className="w-full px-4 py-3 rounded-2xl bg-background border border-border"
          />
          <select
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as Exclude<HouseholdRole, "owner">)}
            className="w-full px-4 py-3 rounded-2xl bg-background border border-border"
          >
            <option value="admin">{isEnglish ? "Administrator" : "Administrator"}</option>
            <option value="member">{isEnglish ? "User" : "Użytkownik"}</option>
            <option value="viewer">{isEnglish ? "View only" : "Podgląd"}</option>
          </select>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={
              isEnglish
                ? "Short label, e.g. partner (optional)"
                : "Krótka nazwa, np. żona (opcjonalnie)"
            }
            className="w-full px-4 py-3 rounded-2xl bg-background border border-border"
          />
          <button
            disabled={busy}
            className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold disabled:opacity-60"
          >
            {busy
              ? isEnglish
                ? "Adding…"
                : "Dodaję…"
              : isEnglish
                ? "Add user"
                : "Dodaj użytkownika"}
          </button>
        </form>
      )}

      <h2 className="font-semibold mb-2 px-1">{isEnglish ? "Members" : "Członkowie"}</h2>
      <ul className="space-y-2">
        {membersQ.data?.map((member) => {
          const profile = profiles.get(member.user_id);
          const isOwner = member.role === "owner";
          return (
            <li
              key={member.id}
              className="bg-card border border-border rounded-2xl p-3 flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold">
                {(profile?.display_name ?? profile?.email ?? "?").charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate flex items-center gap-1.5">
                  {profile?.display_name ?? profile?.email}
                  {isOwner && <Crown className="w-4 h-4 text-accent" />}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {profile?.email}
                  {member.label ? ` · ${member.label}` : ""}
                </div>
                {canManage && !isOwner ? (
                  <select
                    value={member.role}
                    onChange={(e) => changeRole(member.id, e.target.value as HouseholdRole)}
                    className="mt-1 text-xs bg-transparent text-muted-foreground"
                  >
                    <option value="admin">{isEnglish ? "Administrator" : "Administrator"}</option>
                    <option value="member">{isEnglish ? "User" : "Użytkownik"}</option>
                    <option value="viewer">{isEnglish ? "View only" : "Podgląd"}</option>
                  </select>
                ) : (
                  <div className="text-xs text-muted-foreground mt-1">
                    {isEnglish
                      ? labelRole(member.role as HouseholdRole)
                      : ROLE_LABELS[member.role as HouseholdRole]}
                  </div>
                )}
              </div>
              {canManage && member.user_id !== userId && !isOwner && (
                <button
                  onClick={() => remove(member.id)}
                  className="text-destructive p-2"
                  aria-label={isEnglish ? "Remove user" : "Usuń użytkownika"}
                >
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
    case "owner":
      return "Owner";
    case "admin":
      return "Administrator";
    case "member":
      return "User";
    case "viewer":
      return "View only";
  }
}
