(function () {
  'use strict';

  const config = window.OFK_CONFIG || {};
  const supabaseFactory = window.supabase;
  const supabaseClient = (supabaseFactory && config.SUPABASE_URL && config.SUPABASE_PUBLISHABLE_KEY)
    ? supabaseFactory.createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      })
    : null;

  function announce(id, message, isError = false) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('error', Boolean(isError));
  }

  function setBusy(button, busy, busyText, normalText) {
    if (!button) return;
    button.disabled = busy;
    button.setAttribute('aria-busy', busy ? 'true' : 'false');
    button.textContent = busy ? busyText : normalText;
  }

  function showFatal(message) {
    const fatal = document.getElementById('fatal-status');
    if (fatal) {
      fatal.hidden = false;
      fatal.textContent = message;
      fatal.focus();
    }
  }

  async function getSession() {
    if (!supabaseClient) return null;
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    return data.session;
  }

  async function requireSession() {
    const session = await getSession();
    if (!session) {
      const current = encodeURIComponent(window.location.pathname.split('/').pop() + window.location.search);
      window.location.replace(`index.html?next=${current}`);
      return null;
    }
    return session;
  }

  async function signOut() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
    window.location.replace('index.html');
  }

  document.querySelectorAll('[data-logout]').forEach((link) => {
    link.addEventListener('click', async (event) => {
      event.preventDefault();
      await signOut();
    });
  });

  document.querySelectorAll('[data-coming-soon]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      announce('page-status', 'Denne delen bygges i en senere fase.');
    });
  });

  async function initLogin() {
    const form = document.getElementById('login-form');
    if (!form) return;

    if (!supabaseClient) {
      showFatal('Supabase-konfigurasjonen mangler. Kontroller config.js.');
      return;
    }

    try {
      const session = await getSession();
      if (session) {
        window.location.replace('members.html');
        return;
      }
    } catch (error) {
      announce('login-status', `Kunne ikke kontrollere innlogging: ${error.message}`, true);
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;

      announce('login-status', 'Logger inn…');
      setBusy(button, true, 'Logger inn…', 'Logg inn');

      try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data.session) throw new Error('Innloggingen opprettet ingen aktiv sesjon.');

        const { data: profile, error: profileError } = await supabaseClient
          .from('app_users')
          .select('app_role, active')
          .eq('user_id', data.user.id)
          .single();

        if (profileError || !profile || profile.active !== true) {
          await supabaseClient.auth.signOut();
          throw new Error('Kontoen har ikke aktiv tilgang til medlemsportalen.');
        }

        announce('login-status', 'Innlogging godkjent. Åpner medlemslisten.');
        const params = new URLSearchParams(window.location.search);
        const next = params.get('next');
        const safeNext = next && /^(members|person)\.html(?:\?.*)?$/.test(next) ? next : 'members.html';
        window.location.replace(safeNext);
      } catch (error) {
        announce('login-status', `Innlogging mislyktes: ${error.message}`, true);
        document.getElementById('password').focus();
      } finally {
        setBusy(button, false, 'Logger inn…', 'Logg inn');
      }
    });
  }

  let allMembers = [];

  function statusLabel(value) {
    if (value === 'active') return 'Aktiv';
    if (value === 'resigned') return 'Utmeldt';
    return 'Inaktiv';
  }

  function roleNames(member) {
    const rows = member.person_roles || [];
    const active = rows.filter((row) => row.is_active !== false);
    const source = active.length ? active : rows;
    return source.map((row) => row.roles && row.roles.name).filter(Boolean);
  }

  function renderMembers() {
    const body = document.getElementById('member-table-body');
    if (!body) return;
    const search = (document.getElementById('member-search')?.value || '').trim().toLowerCase();
    const role = document.getElementById('role-filter')?.value || '';

    const filtered = allMembers.filter((member) => {
      const roles = roleNames(member);
      const haystack = `${member.full_name || ''} ${member.email || ''} ${member.phone || ''} ${roles.join(' ')}`.toLowerCase();
      return (!search || haystack.includes(search)) && (!role || roles.includes(role));
    });

    body.replaceChildren();
    for (const member of filtered) {
      const tr = document.createElement('tr');
      const roles = roleNames(member).join(', ') || 'Ingen aktiv rolle';
      const values = [
        member.full_name || '',
        member.email || 'Ikke registrert',
        member.phone || 'Ikke registrert',
        roles,
        statusLabel(member.membership_status)
      ];
      for (const value of values) {
        const td = document.createElement('td');
        td.textContent = value;
        tr.appendChild(td);
      }
      const action = document.createElement('td');
      const link = document.createElement('a');
      link.href = `person.html?id=${encodeURIComponent(member.id)}`;
      link.textContent = `Åpne ${member.full_name}`;
      action.appendChild(link);
      tr.appendChild(action);
      body.appendChild(tr);
    }

    announce('result-status', `${filtered.length} av ${allMembers.length} personer vises.`);
  }

  async function loadRoleFilter() {
    const select = document.getElementById('role-filter');
    if (!select) return;
    const { data, error } = await supabaseClient.from('roles').select('name').order('name');
    if (error) throw error;
    for (const role of data || []) {
      const option = document.createElement('option');
      option.value = role.name;
      option.textContent = role.name;
      select.appendChild(option);
    }
  }

  async function initMembers() {
    const body = document.getElementById('member-table-body');
    if (!body) return;
    if (!supabaseClient) {
      showFatal('Supabase-konfigurasjonen mangler. Kontroller config.js.');
      return;
    }

    try {
      const session = await requireSession();
      if (!session) return;

      announce('result-status', 'Henter medlemslisten…');
      await loadRoleFilter();

      const { data, error } = await supabaseClient
        .from('persons')
        .select(`
          id,
          full_name,
          email,
          phone,
          membership_status,
          person_roles (
            is_active,
            started_at,
            ended_at,
            roles ( id, name )
          )
        `)
        .order('full_name');

      if (error) throw error;
      allMembers = data || [];
      renderMembers();
    } catch (error) {
      announce('result-status', `Kunne ikke hente medlemslisten: ${error.message}`, true);
      showFatal('Medlemslisten kunne ikke lastes. Ingen data er endret.');
    }

    const searchInput = document.getElementById('member-search');
    const roleFilter = document.getElementById('role-filter');
    const clearFilters = document.getElementById('clear-filters');
    if (searchInput) searchInput.addEventListener('input', renderMembers);
    if (roleFilter) roleFilter.addEventListener('change', renderMembers);
    if (clearFilters) clearFilters.addEventListener('click', () => {
      searchInput.value = '';
      roleFilter.value = '';
      renderMembers();
      searchInput.focus();
    });
  }

  let currentPerson = null;
  let currentRoleLink = null;
  let rolesById = new Map();

  async function populatePersonRoles(selectedRoleId) {
    const select = document.getElementById('person-role');
    const { data, error } = await supabaseClient.from('roles').select('id, name').order('name');
    if (error) throw error;
    select.replaceChildren();
    rolesById = new Map();
    for (const role of data || []) {
      rolesById.set(role.id, role.name);
      const option = document.createElement('option');
      option.value = role.id;
      option.textContent = role.name;
      if (role.id === selectedRoleId) option.selected = true;
      select.appendChild(option);
    }
  }

  async function initPerson() {
    const form = document.getElementById('person-form');
    if (!form) return;
    if (!supabaseClient) {
      showFatal('Supabase-konfigurasjonen mangler. Kontroller config.js.');
      return;
    }

    try {
      const session = await requireSession();
      if (!session) return;

      const id = new URLSearchParams(window.location.search).get('id');
      if (!id) throw new Error('Person-ID mangler i adressen.');

      announce('form-status', 'Henter person…');
      const { data, error } = await supabaseClient
        .from('persons')
        .select(`
          id,
          full_name,
          email,
          phone,
          membership_status,
          person_roles (
            person_id,
            role_id,
            is_active,
            started_at,
            ended_at,
            roles ( id, name )
          )
        `)
        .eq('id', id)
        .single();
      if (error) throw error;

      currentPerson = data;
      const roleLinks = (data.person_roles || []);
      currentRoleLink = roleLinks.find((row) => row.is_active !== false) || roleLinks[0] || null;

      document.getElementById('person-heading').textContent = `Rediger ${data.full_name}`;
      document.getElementById('full-name').value = data.full_name || '';
      document.getElementById('person-email').value = data.email || '';
      document.getElementById('person-phone').value = data.phone || '';
      await populatePersonRoles(currentRoleLink?.role_id || '');

      const statusRadio = document.querySelector(`input[name="status"][value="${data.membership_status}"]`);
      if (statusRadio) statusRadio.checked = true;
      announce('form-status', 'Personen er lastet.');
    } catch (error) {
      announce('form-status', `Kunne ikke hente personen: ${error.message}`, true);
      form.querySelectorAll('input, select, button').forEach((control) => { control.disabled = true; });
      return;
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const saveButton = form.querySelector('button[type="submit"]');
      const name = document.getElementById('full-name').value.trim();
      const email = document.getElementById('person-email').value.trim() || null;
      const phone = document.getElementById('person-phone').value.trim() || null;
      const membershipStatus = document.querySelector('input[name="status"]:checked')?.value || 'active';
      const selectedRoleId = document.getElementById('person-role').value;

      setBusy(saveButton, true, 'Lagrer…', 'Lagre endringer');
      announce('form-status', 'Lagrer endringer…');

      try {
        const { error: personError } = await supabaseClient
          .from('persons')
          .update({ full_name: name, email, phone, membership_status: membershipStatus })
          .eq('id', currentPerson.id);
        if (personError) throw personError;

        if (currentRoleLink && selectedRoleId && currentRoleLink.role_id !== selectedRoleId) {
          const { error: roleError } = await supabaseClient
            .from('person_roles')
            .update({ role_id: selectedRoleId })
            .eq('person_id', currentPerson.id)
            .eq('role_id', currentRoleLink.role_id);
          if (roleError) throw roleError;
          currentRoleLink.role_id = selectedRoleId;
        } else if (!currentRoleLink && selectedRoleId) {
          const { data: newLink, error: insertRoleError } = await supabaseClient
            .from('person_roles')
            .insert({ person_id: currentPerson.id, role_id: selectedRoleId, is_active: true })
            .select('person_id, role_id, is_active, started_at, ended_at')
            .single();
          if (insertRoleError) throw insertRoleError;
          currentRoleLink = newLink;
        }

        currentPerson.full_name = name;
        document.getElementById('person-heading').textContent = `Rediger ${name}`;
        announce('form-status', 'Endringene er lagret.');
      } catch (error) {
        announce('form-status', `Kunne ikke lagre: ${error.message}`, true);
      } finally {
        setBusy(saveButton, false, 'Lagrer…', 'Lagre endringer');
      }
    });

    const deactivate = document.getElementById('deactivate-role');
    deactivate.addEventListener('click', async () => {
      if (!currentRoleLink || currentRoleLink.is_active === false) {
        announce('form-status', 'Personen har ingen aktiv rolle å deaktivere.');
        return;
      }

      const roleName = rolesById.get(currentRoleLink.role_id) || 'rollen';
      const confirmed = window.confirm(`Vil du deaktivere ${roleName} for ${currentPerson.full_name}? Personen slettes ikke.`);
      if (!confirmed) {
        announce('form-status', 'Deaktivering avbrutt.');
        return;
      }

      setBusy(deactivate, true, 'Deaktiverer…', 'Deaktiver rolle');
      try {
        const today = new Date().toISOString().slice(0, 10);
        const { error } = await supabaseClient
          .from('person_roles')
          .update({ is_active: false, ended_at: today })
          .eq('person_id', currentPerson.id)
          .eq('role_id', currentRoleLink.role_id);
        if (error) throw error;
        currentRoleLink.is_active = false;
        announce('form-status', `${roleName} er deaktivert. Personen er ikke slettet.`);
      } catch (error) {
        announce('form-status', `Kunne ikke deaktivere rollen: ${error.message}`, true);
      } finally {
        setBusy(deactivate, false, 'Deaktiverer…', 'Deaktiver rolle');
      }
    });
  }

  initLogin();
  initMembers();
  initPerson();
})();
