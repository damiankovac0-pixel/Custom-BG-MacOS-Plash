const GREETINGS = [
  { start: 5, key: "morning", short: "Good Morning", full: "Good Morning Damian" },
  { start: 12, key: "afternoon", short: "Good Afternoon", full: "Good Afternoon Damian" },
  { start: 17, key: "evening", short: "Good Evening", full: "Good Evening Damian" },
  { start: 22, key: "night", short: "Good Night", full: "Good Night Damian" }
];

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
const bootWeather = document.querySelector("#bootWeather");
const bootCalendar = document.querySelector("#bootCalendar");
const bootWake = document.querySelector("#bootWake");

let introTimers = [];
let lastIntroAt = 0;
let appState = null;
let stateRetryTimer = null;

function getPhase(date) {
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
  const currentGreeting = getPhase(now);

  phaseLabel.textContent = currentGreeting.short;
  greeting.textContent = currentGreeting.full;
  introTime.textContent = time;
  introDate.textContent = longDate;
  ambientTime.textContent = time;
  ambientDate.textContent = shortDate;
  document.body.dataset.phase = currentGreeting.key;
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

  bootWeather.textContent = weather?.status === "online" ? `weather uplink stable / ${weather.label}` : "weather uplink degraded";
  bootCalendar.textContent = calendar?.status === "online" || hasCalendarData ? "calendar uplink cached / readable" : "calendar uplink awaiting permission";
  bootWake.textContent = appState?.lastWakeAt ? "wake signal captured / pmset" : "wake signal local clock";
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

function playIntro() {
  clearIntroTimers();
  updateTime();

  document.body.classList.remove("preboot", "boot-scan", "boot-lock", "intro-visible", "intro-leaving", "settled");
  document.body.classList.add("intro-active", "booting");

  queueIntroStep(() => {
    document.body.classList.add("boot-scan");
  }, 60);

  queueIntroStep(() => {
    document.body.classList.add("boot-lock");
  }, 280);

  queueIntroStep(() => {
    document.body.classList.add("intro-visible");
  }, 1400);

  queueIntroStep(() => {
    document.body.classList.add("intro-leaving", "settled");
    document.body.classList.remove("intro-visible");
  }, 4200);

  queueIntroStep(() => {
    document.body.classList.remove("intro-active", "intro-leaving", "booting", "boot-scan", "boot-lock");
  }, 5200);

  lastIntroAt = Date.now();
  try {
    localStorage.setItem("customBGPlash.lastIntroAt", String(lastIntroAt));
    if (appState?.lastWakeAt) {
      localStorage.setItem("customBGPlash.lastIntroWakeAt", appState.lastWakeAt);
    }
  } catch {}
}

function settleWithoutIntro() {
  clearIntroTimers();
  updateTime();
  document.body.classList.remove("preboot", "intro-active", "intro-visible", "intro-leaving", "booting", "boot-scan", "boot-lock");
  document.body.classList.add("settled");
}

function shouldPlayIntroOnLoad() {
  return true;
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

const wallpaperVideo = document.querySelector(".wallpaper-video");
let boostTimer = null;

function boostWallpaper(fromEvent) {
  if (fromEvent) {
    const target = fromEvent.target;
    if (target.closest(".calendar-panel, .signal, .boot-sequence, #calendarClose")) return;
  }
  if (wallpaperVideo.readyState < 2) return;

  window.clearTimeout(boostTimer);
  wallpaperVideo.playbackRate = 1.8;

  boostTimer = window.setTimeout(() => {
    wallpaperVideo.playbackRate = 1;
  }, 600);
}

document.addEventListener("click", boostWallpaper);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setCalendarPanel(false);
});

updateTime();
scheduleMinuteTick();
window.requestAnimationFrame(async () => {
  await fetchState();

  if (shouldPlayIntroOnLoad()) {
    playIntro();
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
