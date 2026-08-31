function pad2(n) {
  return String(n).padStart(2, "0");
}

function populateDateSelects(prefix, initialDate = null) {
  const day = document.getElementById(prefix + "Day");
  const month = document.getElementById(prefix + "Month");
  const year = document.getElementById(prefix + "Year");

  const now = initialDate || new Date();
  const currentYear = new Date().getFullYear();

  day.innerHTML = "";
  for (let d = 1; d <= 31; d++) {
    day.insertAdjacentHTML("beforeend", `<option value="${d}">${d}</option>`);
  }

  const months = [
    "Januar","Februar","Mars","April","Mai","Juni",
    "Juli","August","September","Oktober","November","Desember"
  ];
  month.innerHTML = months.map((m, i) =>
    `<option value="${i + 1}">${m}</option>`
  ).join("");

  year.innerHTML = "";
  for (let y = currentYear - 1; y <= currentYear + 5; y++) {
    year.insertAdjacentHTML("beforeend", `<option value="${y}">${y}</option>`);
  }

  day.value = now.getDate();
  month.value = now.getMonth() + 1;
  year.value = now.getFullYear();
}

function populateTimeSelects(prefix, allowNone = false, initialHour = 18, initialMinute = 0) {
  const hour = document.getElementById(prefix + "Hour");
  const minute = document.getElementById(prefix + "Minute");

  hour.innerHTML = allowNone ? `<option value="">Ingen</option>` : "";
  for (let h = 0; h < 24; h++) {
    hour.insertAdjacentHTML("beforeend", `<option value="${pad2(h)}">${pad2(h)}</option>`);
  }

  minute.innerHTML = [0,15,30,45]
    .map(m => `<option value="${pad2(m)}">${pad2(m)}</option>`)
    .join("");

  hour.value = allowNone && initialHour === null ? "" : pad2(initialHour ?? 18);
  minute.value = pad2(initialMinute ?? 0);
}

function getDateFromSelects(prefix) {
  const d = Number(document.getElementById(prefix + "Day").value);
  const m = Number(document.getElementById(prefix + "Month").value);
  const y = Number(document.getElementById(prefix + "Year").value);

  const date = new Date(y, m - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }

  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function getTimeFromSelects(prefix, allowNone = false) {
  const h = document.getElementById(prefix + "Hour").value;
  const m = document.getElementById(prefix + "Minute").value;

  if (allowNone && !h) return null;
  return `${h}:${m}:00`;
}

function setDateSelects(prefix, isoDate) {
  if (!isoDate) return;
  const [y,m,d] = isoDate.split("-").map(Number);
  document.getElementById(prefix + "Day").value = d;
  document.getElementById(prefix + "Month").value = m;
  document.getElementById(prefix + "Year").value = y;
}

function setTimeSelects(prefix, timeValue, allowNone = false) {
  if (!timeValue) {
    if (allowNone) document.getElementById(prefix + "Hour").value = "";
    return;
  }
  const [h,m] = timeValue.split(":");
  document.getElementById(prefix + "Hour").value = h;
  document.getElementById(prefix + "Minute").value = ["00","15","30","45"].includes(m) ? m : "00";
}

function norwegianDate(isoDate) {
  if (!isoDate) return "";
  const [y,m,d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("nb-NO");
}

function norwegianTime(timeValue) {
  if (!timeValue) return "";
  return timeValue.slice(0,5);
}

function eventStatusText(status) {
  return ({
    planned: "Planlagt",
    cancelled: "Avlyst",
    completed: "Gjennomført"
  })[status] || status;
}
