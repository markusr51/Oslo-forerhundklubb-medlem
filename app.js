const demoMembers = [
  {id:'1', name:'Testperson Alfa', email:'alfa@example.no', phone:'40000001', role:'Ekvipasje', status:'Aktiv'},
  {id:'2', name:'Testperson Beta', email:'beta@example.no', phone:'40000002', role:'Hjelpetrener', status:'Aktiv'},
  {id:'3', name:'Testperson Gamma', email:'gamma@example.no', phone:'40000003', role:'Dyrepleier', status:'Aktiv'},
  {id:'4', name:'Testperson Delta', email:'delta@example.no', phone:'40000004', role:'Medlem', status:'Inaktiv'}
];

function announce(id, message) {
  const el = document.getElementById(id);
  if (el) el.textContent = message;
}

const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    announce('login-status', 'Testinnlogging godkjent. Åpner medlemslisten.');
    setTimeout(() => { window.location.href = 'members.html'; }, 250);
  });
}

function renderMembers() {
  const body = document.getElementById('member-table-body');
  if (!body) return;
  const search = (document.getElementById('member-search')?.value || '').trim().toLowerCase();
  const role = document.getElementById('role-filter')?.value || '';
  const filtered = demoMembers.filter((m) => {
    const haystack = `${m.name} ${m.email} ${m.phone}`.toLowerCase();
    return (!search || haystack.includes(search)) && (!role || m.role === role);
  });
  body.replaceChildren();
  for (const member of filtered) {
    const tr = document.createElement('tr');
    const values = [member.name, member.email, member.phone, member.role, member.status];
    for (const value of values) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.appendChild(td);
    }
    const action = document.createElement('td');
    const link = document.createElement('a');
    link.href = `person.html?id=${encodeURIComponent(member.id)}`;
    link.textContent = `Åpne ${member.name}`;
    action.appendChild(link);
    tr.appendChild(action);
    body.appendChild(tr);
  }
  announce('result-status', `${filtered.length} av ${demoMembers.length} testpersoner vises.`);
}

const searchInput = document.getElementById('member-search');
const roleFilter = document.getElementById('role-filter');
if (searchInput) searchInput.addEventListener('input', renderMembers);
if (roleFilter) roleFilter.addEventListener('change', renderMembers);
const clearFilters = document.getElementById('clear-filters');
if (clearFilters) clearFilters.addEventListener('click', () => {
  searchInput.value = '';
  roleFilter.value = '';
  renderMembers();
  searchInput.focus();
});
if (document.getElementById('member-table-body')) renderMembers();

document.querySelectorAll('[data-coming-soon]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    alert('Denne delen bygges i en senere fase.');
  });
});

const personForm = document.getElementById('person-form');
if (personForm) {
  const params = new URLSearchParams(window.location.search);
  const member = demoMembers.find((m) => m.id === params.get('id')) || demoMembers[0];
  document.getElementById('person-heading').textContent = `Rediger ${member.name}`;
  document.getElementById('full-name').value = member.name;
  document.getElementById('person-email').value = member.email;
  document.getElementById('person-phone').value = member.phone;
  document.getElementById('person-role').value = member.role;
  const statusValue = member.status === 'Aktiv' ? 'active' : 'inactive';
  const statusRadio = document.querySelector(`input[name="status"][value="${statusValue}"]`);
  if (statusRadio) statusRadio.checked = true;

  personForm.addEventListener('submit', (event) => {
    event.preventDefault();
    announce('form-status', 'Test: Endringene ville blitt lagret. Ingen ekte data er endret.');
  });
  document.getElementById('deactivate-role').addEventListener('click', () => {
    announce('form-status', 'Test: Rollen ville blitt deaktivert. Ingen ekte data er endret.');
  });
}
