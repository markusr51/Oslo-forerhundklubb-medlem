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


async function currentPortalCapabilities(me = null) {
  const appUser = me || await getCurrentAppUser();

  const caps = {
    isAdmin:
      appUser?.app_role === "admin" ||
      appUser?.app_role === "system_admin",
    isSystemAdmin:
      appUser?.app_role === "system_admin",
    isHelper: false
  };

  if (caps.isAdmin) {
    caps.isHelper = true;
    return caps;
  }

  if (!appUser?.person_id) return caps;

  try {
    const {data,error} = await sb
      .from("person_roles")
      .select("roles(name)")
      .eq("person_id", appUser.person_id)
      .eq("is_active", true);

    if (!error) {
      caps.isHelper = (data || []).some(row =>
        String(row.roles?.name || "").trim().toLowerCase() === "hjelpetrener"
      );
    }
  } catch (error) {
    console.error("Kunne ikke kontrollere personroller for navigasjonen:", error);
  }

  return caps;
}

async function renderPortalNavigation({
  current = "",
  me = null,
  targetId = "portalNav"
} = {}) {
  const nav = document.getElementById(targetId);
  if (!nav) return;

  const appUser = me || await getCurrentAppUser();
  const caps = await currentPortalCapabilities(appUser);

  const memberItems = [
    ["my-page.html", "Min side", "my-page"],
    ["library.html", "Dokumentbibliotek", "library"]
  ];

  if (caps.isHelper) {
    memberItems.push([
      "helper-settlement.html",
      "Hjelpetreneroppgjør",
      "helper-settlement"
    ]);
  }

  const adminItems = [
    ["admin-dashboard.html", "Oversikt", "admin-dashboard"],
    ["members.html", "Medlemmer", "members"],
    ["events.html", "Arrangementer", "events"],
    ["event-templates.html", "Arrangementsmaler", "event-templates"],
    ["groups.html", "Grupper og utvalg", "groups"],
    ["roles.html", "Roller", "roles"],
    ["library.html", "Dokumentbibliotek", "library"],
    ["helper-settlement.html", "Hjelpetreneroppgjør", "helper-settlement"],
    ["sms.html", "SMS", "sms"],
    ["email.html", "E-post", "email"],
    ["communication-history.html", "Kommunikasjonshistorikk", "communication-history"]
  ];

  if (caps.isSystemAdmin) {
    adminItems.push(["admins.html", "Brukere og tilganger", "admins"]);
  }

  const items = caps.isAdmin
    ? [["my-page.html", "Min side", "my-page"], ...adminItems]
    : memberItems;

  nav.innerHTML = items.map(([href,label,key]) => {
    const currentAttr = key === current ? ' aria-current="page"' : "";
    return `<a href="${href}"${currentAttr}>${label}</a>`;
  }).join("\n") +
    '\n<button type="button" id="portalLogoutButton">Logg ut</button>';

  const logoutButton = document.getElementById("portalLogoutButton");
  if (logoutButton) logoutButton.addEventListener("click", logout);
}
