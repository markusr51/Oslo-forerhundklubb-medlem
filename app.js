const cfg = window.APP_CONFIG;
const sb = supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);

async function requireSession(options = {}) {
  const { data: { session } } = await sb.auth.getSession();

  if (!session) {
    location.href = "index.html";
    return null;
  }

  if (!options.allowPasswordSetup) {
    const { data, error } = await sb
      .from("app_users")
      .select("must_change_password,active")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (!error && data) {
      if (data.active === false) {
        await sb.auth.signOut();
        location.href = "index.html?disabled=1";
        return null;
      }

      if (data.must_change_password === true) {
        location.href = "set-password.html";
        return null;
      }
    }
  }

  return session;
}

async function logout() {
  await sb.auth.signOut();
  location.href = "index.html";
}

function announce(msg) {
  const el = document.getElementById("status");
  if (el) el.textContent = msg;
}

async function getCurrentAppUser() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;

  const { data, error } = await sb
    .from("app_users")
    .select("user_id,display_name,app_role,active,person_id,must_change_password,first_login_completed_at")
    .eq("user_id", user.id)
    .single();

  if (error) throw error;
  return data;
}

async function portalHome() {
  const me = await getCurrentAppUser();
  if (!me) return "index.html";

  if (me.app_role === "admin" || me.app_role === "system_admin") {
    return "admin-dashboard.html";
  }

  return "my-page.html";
}

function downloadBlob(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvCell(v) {
  if (v == null) return "";
  const s = String(v).replace(/"/g,'""');
  return '"' + s + '"';
}
