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


function formatSelectedDate(prefix) {
  const iso = getDateFromSelects(prefix);
  return iso ? norwegianDate(iso) : "Ugyldig dato";
}
function formatSelectedTime(prefix, allowNone = false) {
  const value = getTimeFromSelects(prefix, allowNone);
  if (!value && allowNone) return "Ingen sluttid";
  return value ? norwegianTime(value) : "Ugyldig tid";
}
function wireSelectionStatus(prefix, outputId, kind, allowNone = false) {
  const output = document.getElementById(outputId);
  if (!output) return;
  const update = () => {
    output.textContent = kind === "date"
      ? "Valgt dato: " + formatSelectedDate(prefix)
      : "Valgt tid: " + formatSelectedTime(prefix, allowNone);
  };
  const ids = kind === "date"
    ? [prefix + "Day", prefix + "Month", prefix + "Year"]
    : [prefix + "Hour", prefix + "Minute"];
  ids.forEach(id => document.getElementById(id)?.addEventListener("change", update));
  update();
}
function textToBase64(text) { return btoa(unescape(encodeURIComponent(text))); }
function escapeIcsText(value) {
  return String(value || "").replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;");
}
function eventIcsAttachment(event) {
  const sd=String(event.event_date||"").replaceAll("-","");
  const ed=String(event.end_date||event.event_date||"").replaceAll("-","");
  const st=String(event.start_time||"00:00:00").slice(0,5).replace(":","")+"00";
  const et=String(event.end_time||event.start_time||"00:00:00").slice(0,5).replace(":","")+"00";
  const stamp=new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");
  const ics=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Oslo Førerhundklubb//Medlemsportal//NO","CALSCALE:GREGORIAN","METHOD:REQUEST","BEGIN:VEVENT",`UID:${event.id}@osloforerhundklubb.no`,`DTSTAMP:${stamp}`,`DTSTART:${sd}T${st}`,`DTEND:${ed}T${et}`,`SUMMARY:${escapeIcsText(event.title)}`,`LOCATION:${escapeIcsText(event.location||"")}`,`DESCRIPTION:${escapeIcsText(event.description||"")}`,`STATUS:${event.status==="cancelled"?"CANCELLED":"CONFIRMED"}`,"END:VEVENT","END:VCALENDAR"].join("\r\n");
  return {filename:(event.title||"arrangement").replace(/[^A-Za-z0-9_-]+/g,"_")+".ics",content:textToBase64(ics),contentType:"text/calendar; charset=utf-8; method=REQUEST",size:new Blob([ics]).size};
}
