const cfg = window.APP_CONFIG;
const sb = supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);

async function requireSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    location.href = "index.html";
    return null;
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
  const { data, error } = await sb.from("app_users")
    .select("user_id,display_name,app_role,active")
    .eq("user_id", user.id).single();
  if (error) throw error;
  return data;
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
