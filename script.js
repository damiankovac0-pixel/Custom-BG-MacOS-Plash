const GREETINGS = [
  { start: 5, short: "Good Morning", full: "Good Morning Damian" },
  { start: 12, short: "Good Afternoon", full: "Good Afternoon Damian" },
  { start: 17, short: "Good Evening", full: "Good Evening Damian" },
  { start: 22, short: "Good Night", full: "Good Night Damian" }
];

const INTRO_TIMING = {
  showAfter: 120,
  holdFor: 2600,
  fadeFor: 1500
};
const INTRO_COOLDOWN = 4 * 60 * 60 * 1000;
const API_BASE = location.protocol === "file:" ? "http://127.0.0.1:4173" : "";

const greeting = document.querySelector("#greeting");
const phaseLabel = document.querySelector("#phaseLabel");
const introTime = document.querySelector("#introTime");
const introDate = document.querySelector("#introDate");
const ambientTime = document.querySelector("#ambientTime");
const ambientDate = document.querySelector("#ambientDate");
const weatherSignal = document.querySelector("#weatherSignal");
const calendarSignal = document.querySelector("#calendarSignal");
const weatherValue = document.querySelector("#weatherValue");
const weatherMeta = document.querySelector("#weatherMeta");
const calendarValue = document.querySelector("#calendarValue");
const calendarMeta = document.querySelector("#calendarMeta");
const calendarPanel = document.querySelector("#calendarPanel");
const calendarClose = document.querySelector("#calendarClose");
const todayEvents = document.querySelector("#todayEvents");
const weekEvents = document.querySelector("#weekEvents");

let introTimers = [];
let lastIntroAt = 0;
let appState = null;
let stateRetryTimer = null;

function getGreeting(date) {
  const hour = date.getHours() + date.getMinutes() / 60;
  return [...GREETINGS].reverse().find((item) => hour >= item.start) || GREETINGS[GREETINGS.length - 1];
}

function updateTime() {
  const now = new Date();
  const time = new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(now);
  const longDate = new Intl.DateTimeFormat([], {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(now);
  const shortDate = new Intl.DateTimeFormat([], {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(now);
  const currentGreeting = getGreeting(now);

  phaseLabel.textContent = currentGreeting.short;
  greeting.textContent = currentGreeting.full;
  introTime.textContent = time;
  introDate.textContent = longDate;
  ambientTime.textContent = time;
  ambientDate.textContent = shortDate;
}

async function fetchState() {
  try {
    const response = await fetch(`${API_BASE}/api/state`, { cache: "no-store" });
    if (!response.ok) throw new Error(`State request failed: ${response.status}`);
    appState = await response.json();
    scheduleStateRefresh(60_000);
  } catch {
    appState = null;
    scheduleStateRefresh(5_000);
  }

  renderSignals();
  renderCalendarPanel();
}

function scheduleStateRefresh(delay) {
  window.clearTimeout(stateRetryTimer);
  stateRetryTimer = window.setTimeout(fetchState, delay);
}

function renderSignals() {
  const weather = appState?.today?.weather;
  const calendar = appState?.today?.calendar;
  const hasCalendarData = Boolean(calendar?.todayEvents?.length || calendar?.weekEvents?.length || calendar?.events?.length);

  weatherSignal.dataset.status = weather?.status || "offline";
  calendarSignal.dataset.status = calendar?.status === "online" || hasCalendarData ? "online" : "offline";

  if (weather?.status === "online") {
    weatherValue.textContent = weather.label;
    weatherMeta.textContent = [weather.location, weather.highC !== null ? `H ${weather.highC}°` : null, weather.lowC !== null ? `L ${weather.lowC}°` : null]
      .filter(Boolean)
      .join(" / ");
  } else {
    weatherValue.textContent = weather?.label || "Offline";
    weatherMeta.textContent = appState ? "Weather sync unavailable" : "Connecting to helper";
  }

  if (calendar?.status === "online" || hasCalendarData) {
    calendarValue.textContent = calendar.label || "Calendar ready";
    calendarMeta.textContent = calendar.todayEvents?.length
      ? `${calendar.todayEvents.length} today / ${calendar.weekEvents?.length || 0} week`
      : `${calendar.weekEvents?.length || 0} this week`;
  } else {
    calendarValue.textContent = calendar?.label || "Unavailable";
    calendarMeta.textContent = appState ? "macOS Calendar permission needed" : "Connecting to helper";
  }
}

function renderCalendarPanel() {
  const calendar = appState?.today?.calendar;
  renderEventList(todayEvents, calendar?.todayEvents || calendar?.events || [], "No events today");
  renderEventList(weekEvents, calendar?.weekEvents || [], "No events this week", { showDay: true });
}

function renderEventList(list, events, emptyText, { showDay = false } = {}) {
  list.replaceChildren();

  if (events.length === 0) {
    const item = document.createElement("li");
    item.className = "event-empty";
    item.textContent = emptyText;
    list.append(item);
    return;
  }

  events.forEach((event) => {
    const item = document.createElement("li");
    const time = document.createElement("time");
    const title = document.createElement("span");
    const meta = document.createElement("small");

    time.dateTime = event.startAt || "";
    time.textContent = showDay ? `${formatEventDay(event.startAt)} ${formatEventRange(event)}` : formatEventRange(event);
    title.textContent = event.title || "Untitled";
    meta.textContent = [event.calendar, event.location].filter(Boolean).join(" / ");

    item.append(time, title, meta);
    list.append(item);
  });
}

function formatEventDay(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat([], { weekday: "short", month: "short", day: "numeric" }).format(date);
}

function formatEventRange(event) {
  if (event.isAllDay) return "All day";
  const start = formatEventTime(event.startAt);
  const end = formatEventTime(event.endAt);
  return end ? `${start} - ${end}` : start;
}

function formatEventTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}

function clearIntroTimers() {
  introTimers.forEach((timer) => window.clearTimeout(timer));
  introTimers = [];
}

function queueIntroStep(callback, delay) {
  const timer = window.setTimeout(callback, delay);
  introTimers.push(timer);
}

function playIntro({ force = false } = {}) {
  const now = Date.now();

  if (!force && now - lastIntroAt < 8000) return;

  lastIntroAt = now;
  localStorage.setItem("customBGPlash.lastIntroAt", String(now));
  if (appState?.lastWakeAt) {
    localStorage.setItem("customBGPlash.lastIntroWakeAt", appState.lastWakeAt);
  }
  clearIntroTimers();
  updateTime();

  document.body.classList.remove("preboot", "intro-visible", "intro-leaving", "settled");
  document.body.classList.add("intro-active");

  queueIntroStep(() => {
    document.body.classList.add("intro-visible");
  }, INTRO_TIMING.showAfter);

  queueIntroStep(() => {
    document.body.classList.add("intro-leaving", "settled");
    document.body.classList.remove("intro-visible");
  }, INTRO_TIMING.showAfter + INTRO_TIMING.holdFor);

  queueIntroStep(() => {
    document.body.classList.remove("intro-active", "intro-leaving");
  }, INTRO_TIMING.showAfter + INTRO_TIMING.holdFor + INTRO_TIMING.fadeFor);
}

function settleWithoutIntro() {
  clearIntroTimers();
  updateTime();
  document.body.classList.remove("preboot", "intro-active", "intro-visible", "intro-leaving");
  document.body.classList.add("settled");
}

function shouldPlayIntroOnLoad() {
  if (appState?.lastWakeAt) {
    return localStorage.getItem("customBGPlash.lastIntroWakeAt") !== appState.lastWakeAt;
  }

  const saved = Number(localStorage.getItem("customBGPlash.lastIntroAt") || 0);
  return !saved || Date.now() - saved > INTRO_COOLDOWN;
}

function setCalendarPanel(open) {
  calendarSignal.setAttribute("aria-expanded", String(open));

  if (open) {
    calendarPanel.hidden = false;
    window.requestAnimationFrame(() => document.body.classList.add("calendar-open"));
    return;
  }

  document.body.classList.remove("calendar-open");
  window.setTimeout(() => {
    if (calendarSignal.getAttribute("aria-expanded") === "false") {
      calendarPanel.hidden = true;
    }
  }, 360);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    updateTime();
    fetchState();
  }
});

calendarSignal.addEventListener("click", () => {
  setCalendarPanel(calendarPanel.hidden);
});

calendarClose.addEventListener("click", () => setCalendarPanel(false));

document.addEventListener("click", (event) => {
  if (calendarPanel.hidden) return;
  if (calendarPanel.contains(event.target) || calendarSignal.contains(event.target)) return;
  setCalendarPanel(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setCalendarPanel(false);
});

updateTime();
scheduleMinuteTick();
window.requestAnimationFrame(async () => {
  await fetchState();

  if (shouldPlayIntroOnLoad()) {
    playIntro({ force: true });
  } else {
    settleWithoutIntro();
  }
});

function scheduleMinuteTick() {
  const now = new Date();
  const delay = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds());

  window.setTimeout(() => {
    updateTime();
    scheduleMinuteTick();
  }, delay);
}
