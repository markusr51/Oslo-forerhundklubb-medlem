const cfg = window.APP_CONFIG;
const OSLO_CLUB_ID = '00000000-0000-4000-8000-000000000001';
const portalClubId = localStorage.getItem('portalClubId') || OSLO_CLUB_ID;
const sb = supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
  global: { fetch: (input, options = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const headers = new Headers(options.headers || (typeof input !== 'string' ? input.headers : undefined));
    if (url.startsWith(cfg.supabaseUrl) && /\/(rest|functions|storage)\/v1\//.test(url)) headers.set('x-portal-club', portalClubId);
    return fetch(input, {...options, headers});
  }}
});

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
  const {data:clubs,error:clubError}=await sb.rpc('portal_my_clubs');
  if (clubError) throw clubError;
  if (clubs?.length && !clubs.some(c=>c.club_id===portalClubId)) {
    localStorage.setItem('portalClubId',clubs[0].club_id);
    location.reload();
    throw new Error('Bytter til klubben du har tilgang til.');
  }
  const {data:role,error:roleError}=await sb.rpc('current_app_role');
  if(roleError)throw roleError;
  return {...data,global_app_role:data.app_role,app_role:role==='portal_user'?'readonly':role,clubs:clubs||[]};
}

async function portalHome() {
  const me = await getCurrentAppUser();
  if (!me) return "index.html";

  if (me.app_role === "admin" || me.app_role === "system_admin") {
    return "admin-dashboard.html";
  }

  return me.clubs?.length ? "my-page.html" : "my-dog.html";
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
    isHelper: false,
    isGuideViewUser: false,
    personRoles: []
  };

  if (caps.isAdmin) {
    caps.isHelper = true;
    caps.isGuideViewUser = true;
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
      caps.personRoles = (data || []).map(row =>
        String(row.roles?.name || "").trim().toLowerCase()
      );
      caps.isHelper = caps.personRoles.includes("hjelpetrener");
      caps.isGuideViewUser = caps.personRoles.some(role =>
        ["ekvipasje", "ekstern ekvipasje", "hjelpetrener", "hjelpetreneraspirant", "skoletrener"].includes(role)
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

  if (!document.getElementById(`${targetId}-heading`)) {
    const heading = document.createElement("h2");
    heading.id = `${targetId}-heading`;
    heading.textContent = "Hovedmeny";
    nav.insertAdjacentElement("beforebegin", heading);
    nav.setAttribute("aria-labelledby", heading.id);
    nav.removeAttribute("aria-label");
  }

  const appUser = me || await getCurrentAppUser();
  const caps = await currentPortalCapabilities(appUser);

  let clubChooser=document.getElementById('portalClubChooser');
  if(!clubChooser){
    clubChooser=document.createElement('div');clubChooser.id='portalClubChooser';
    const label=document.createElement('label');label.htmlFor='portalClubSelect';label.textContent='Valgt klubb';
    const select=document.createElement('select');select.id='portalClubSelect';
    for(const c of appUser?.clubs||[]){const option=document.createElement('option');option.value=c.club_id;option.textContent=c.name;select.append(option);}
    select.value=portalClubId;select.addEventListener('change',()=>{localStorage.setItem('portalClubId',select.value);location.href='my-page.html';});
    clubChooser.append(label,select);clubChooser.hidden=!(appUser?.clubs?.length);nav.before(clubChooser);
  }
  const memberItems = [
    ["my-page.html", "Min side", "my-page"],
    ["my-dog.html", "Min hund", "my-dog"],
    ["clubs.html", "Klubber og oppdrag", "clubs"],
    ["library.html", "Dokumentbibliotek", "library"],
    ["my-expenses.html", "Mine utlegg", "my-expenses"],
    ["my-forms.html", "Mine skjemaer", "my-forms"],
    ["helper-request.html", "Be om hjelp", "helper-request"]
  ];

  if (caps.isGuideViewUser) {
    memberItems.push([
      "guideview.html",
      "GuideView",
      "guideview"
    ]);
  }

  if (caps.isHelper) {
    memberItems.push([
      "clubs.html",
      "Hjelpetreneroppgjør",
      "helper-settlement"
    ]);
    memberItems.push([
      "helper-requests.html",
      "Hjelpetreneroppdrag",
      "helper-requests"
    ]);
  }

  const adminItems = [
    ["my-dog.html", "Min hund", "my-dog"],
    ["clubs.html", "Klubber og oppdrag", "clubs"],
    ["admin-dashboard.html", "Oversikt", "admin-dashboard"],
    ["members.html", "Medlemmer", "members"],
    ["events.html", "Arrangementer", "events"],
    ["event-templates.html", "Arrangementsmaler", "event-templates"],
    ["forms.html", "Skjemaer", "forms"],
    ["my-forms.html", "Mine skjemaer", "my-forms"],
    ["groups.html", "Grupper og utvalg", "groups"],
    ["roles.html", "Roller", "roles"],
    ["library.html", "Dokumentbibliotek", "library"],
    ["clubs.html", "Hjelpetreneroppgjør", "helper-settlement"],
    ["helper-overview.html", "Hjelpetreneroversikt", "helper-overview"],
    ["helper-requests.html", "Hjelpetrenerforespørsler", "helper-requests"],
    ["helper-board-overview.html", "Hjelpetreneroppfølging", "helper-board-overview"],
    ["expense-admin.html", "Utlegg", "expense-admin"],
    ["sms.html", "SMS", "sms"],
    ["email.html", "E-post", "email"],
    ...(portalClubId===OSLO_CLUB_ID ? [["fiken.html?v=025", "Fiken", "fiken"]] : []),
    ["communication-history.html", "Kommunikasjonshistorikk", "communication-history"],
    ["guideview.html", "GuideView", "guideview"]
  ];

  if (caps.isSystemAdmin) {
    adminItems.push(["admins.html", "Brukere og tilganger", "admins"]);
    adminItems.push(["portal-support.html", "Support og klubbtilganger", "portal-support"]);
  }

  const items = caps.isAdmin
    ? [["my-page.html", "Min side", "my-page"], ...adminItems]
    : appUser?.clubs?.length ? memberItems : [["my-dog.html", "Min hund", "my-dog"],["library.html", "Dokumentbibliotek", "library"]];

  nav.innerHTML = items.map(([href,label,key]) => {
    const currentAttr = key === current ? ' aria-current="page"' : "";
    return `<a href="${href}"${currentAttr}>${label}</a>`;
  }).join("\n") +
    '\n<button type="button" id="portalLogoutButton">Logg ut</button>';

  const logoutButton = document.getElementById("portalLogoutButton");
  if (logoutButton) logoutButton.addEventListener("click", logout);
}


function installAccessibleSelectFeedback(root = document) {
  const bind = select => {
    if (!(select instanceof HTMLSelectElement)) return;
    if (select.dataset.selectionFeedbackBound === "true") return;
    if (select.dataset.selectionFeedback === "off") return;

    select.dataset.selectionFeedbackBound = "true";

    const id = select.id || `select-${crypto.randomUUID()}`;
    if (!select.id) select.id = id;

    const statusId = `${id}-selection-status`;
    let status = document.getElementById(statusId);

    if (!status) {
      status = document.createElement("p");
      status.id = statusId;
      status.className = "selection-status";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      status.dataset.selectStatusFor = id;
      select.insertAdjacentElement("afterend", status);
    }

    const described = new Set(
      String(select.getAttribute("aria-describedby") || "")
        .split(/\s+/)
        .filter(Boolean)
    );
    described.add(statusId);
    select.setAttribute("aria-describedby", [...described].join(" "));

    const update = () => {
      const option = select.options[select.selectedIndex];
      const text = option?.textContent?.trim() || "Ingen valgt";
      status.textContent = `Valgt: ${text}.`;
    };

    select.addEventListener("change", update);
    update();
  };

  root.querySelectorAll?.("select").forEach(bind);

  if (!window.__selectFeedbackObserver) {
    window.__selectFeedbackObserver = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches?.("select")) bind(node);
          node.querySelectorAll?.("select").forEach(bind);
        }
      }
    });

    window.__selectFeedbackObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => installAccessibleSelectFeedback());
} else {
  installAccessibleSelectFeedback();
}
