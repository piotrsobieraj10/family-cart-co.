import { createClient } from "@supabase/supabase-js";

const email = "biuro@autosafe.immo";
const householdName = "AutoSafe";
const password = process.env.ADMIN_TEMP_PASSWORD;
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

if (!password) {
  console.error("Missing ADMIN_TEMP_PASSWORD. Set it in the shell/Replit Secrets before running.");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserByEmail() {
  let page = 1;
  while (page < 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 1000) return null;
    page += 1;
  }
  return null;
}

let user = await findUserByEmail();

if (!user) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "AutoSafe", first_name: "AutoSafe" },
  });
  if (error) throw error;
  user = data.user;
  console.log("Admin auth user created.");
} else {
  console.log("Admin auth user already exists.");
}

const { error: profileError } = await admin.from("profiles").upsert(
  {
    user_id: user.id,
    email,
    display_name: "AutoSafe",
    first_name: "AutoSafe",
    must_change_password: true,
    must_complete_profile: true,
  },
  { onConflict: "user_id" },
);
if (profileError) throw profileError;

let { data: household, error: householdReadError } = await admin
  .from("households")
  .select("id")
  .eq("name", householdName)
  .eq("owner_id", user.id)
  .maybeSingle();
if (householdReadError) throw householdReadError;

if (!household) {
  const created = await admin
    .from("households")
    .insert({ name: householdName, owner_id: user.id })
    .select("id")
    .single();
  if (created.error) throw created.error;
  household = created.data;
  console.log("AutoSafe household created.");
} else {
  console.log("AutoSafe household already exists.");
}

const { error: memberError } = await admin.from("household_members").upsert(
  {
    household_id: household.id,
    user_id: user.id,
    role: "owner",
    status: "active",
    created_by: user.id,
  },
  { onConflict: "household_id,user_id" },
);
if (memberError) throw memberError;

console.log("Admin profile and owner membership are ready.");
