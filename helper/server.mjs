import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DATA_DIR = join(ROOT, "data");
const CONFIG_DIR = join(ROOT, "config");
const STATE_FILE = join(DATA_DIR, "state.json");
const EVENTS_FILE = join(DATA_DIR, "events.jsonl");
const SETTINGS_FILE = join(CONFIG_DIR, "settings.json");
const SETTINGS_EXAMPLE_FILE = join(CONFIG_DIR, "settings.example.json");
const PORT = Number(process.env.CUSTOMBGPLASH_PORT || 4173);
const POLL_INTERVAL_MS = 30_000;
const DEFAULT_WEATHER_REFRESH_MS = 30 * 60 * 1000;
const DEFAULT_CALENDAR_REFRESH_MS = 5 * 60 * 1000;

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".ttf", "font/ttf"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".ico", "image/x-icon"]
]);

let settings = await loadSettings();
let state = await loadState();
let lastWeatherSyncAt = 0;
let lastCalendarSyncAt = 0;

await mkdir(DATA_DIR, { recursive: true });
await saveState("helper_start");
await detectWake();
await syncIntegrations({ force: true });
setInterval(() => {
  detectWake().catch((error) => logEvent("wake_detect_error", { message: error.message }));
  syncIntegrations().catch((error) => logEvent("integration_sync_error", { message: error.message }));
}, POLL_INTERVAL_MS);

const server = createServer(async (request, response) => {
  try {
    await routeRequest(request, response);
  } catch (error) {
    await logEvent("request_error", { message: error.message, url: request.url });
    sendJson(response, 500, { error: "internal_error" });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`CustomBGPlash helper listening on http://127.0.0.1:${PORT}`);
});

async function routeRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || `127.0.0.1:${PORT}`}`);

  if (request.method === "GET" && url.pathname === "/api/state") {
    sendJson(response, 200, state);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/sync") {
    await syncIntegrations({ force: true });
    sendJson(response, 200, state);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/todos") {
    const body = await readJsonBody(request);
    const text = String(body.text || "").trim();

    if (!text) {
      sendJson(response, 400, { error: "missing_text" });
      return;
    }

    state.today.todos.unshift({
      id: crypto.randomUUID(),
      text,
      done: false,
      createdAt: new Date().toISOString()
    });
    await saveState("todo_add", { text });
    sendJson(response, 201, state);
    return;
  }

  const todoMatch = url.pathname.match(/^\/api\/todos\/([^/]+)$/);
  if (todoMatch && request.method === "PATCH") {
    const body = await readJsonBody(request);
    const todo = state.today.todos.find((item) => item.id === decodeURIComponent(todoMatch[1]));

    if (!todo) {
      sendJson(response, 404, { error: "not_found" });
      return;
    }

    if (typeof body.done === "boolean") todo.done = body.done;
    if (typeof body.text === "string") todo.text = body.text.trim() || todo.text;
    todo.updatedAt = new Date().toISOString();
    await saveState("todo_update", { id: todo.id });
    sendJson(response, 200, state);
    return;
  }

  if (todoMatch && request.method === "DELETE") {
    const id = decodeURIComponent(todoMatch[1]);
    const before = state.today.todos.length;
    state.today.todos = state.today.todos.filter((item) => item.id !== id);

    if (state.today.todos.length === before) {
      sendJson(response, 404, { error: "not_found" });
      return;
    }

    await saveState("todo_remove", { id });
    sendJson(response, 200, state);
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { error: "method_not_allowed" });
    return;
  }

  await serveStatic(url.pathname, request, response);
}

async function serveStatic(pathname, request, response) {
  const requested = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const normalized = normalize(requested).replace(/^[/\\]+/, "");
  const filePath = resolve(ROOT, normalized);
  const rel = relative(ROOT, filePath);

  if (rel.startsWith("..") || rel === "" || rel.includes("node_modules")) {
    sendJson(response, 403, { error: "forbidden" });
    return;
  }

  try {
    const type = MIME_TYPES.get(extname(filePath).toLowerCase()) || "application/octet-stream";
    response.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": "no-store"
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    createReadStream(filePath).pipe(response);
  } catch {
    sendJson(response, 404, { error: "not_found" });
  }
}

async function loadState() {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    const parsed = JSON.parse(await readFile(STATE_FILE, "utf8"));
    return normalizeState(parsed);
  } catch {
    return normalizeState({});
  }
}

async function loadSettings() {
  await mkdir(CONFIG_DIR, { recursive: true });

  try {
    return normalizeSettings(JSON.parse(await readFile(SETTINGS_FILE, "utf8")));
  } catch {
    try {
      return normalizeSettings(JSON.parse(await readFile(SETTINGS_EXAMPLE_FILE, "utf8")));
    } catch {
      return normalizeSettings({});
    }
  }
}

function normalizeSettings(input) {
  return {
    weather: {
      enabled: input.weather?.enabled !== false,
      provider: input.weather?.provider || "open-meteo",
      refreshMinutes: Number(input.weather?.refreshMinutes || 30),
      location: {
        mode: input.weather?.location?.mode || "autoIp",
        name: input.weather?.location?.name || null,
        latitude: finiteOrNull(input.weather?.location?.latitude),
        longitude: finiteOrNull(input.weather?.location?.longitude),
        timezone: input.weather?.location?.timezone || "auto"
      }
    },
    calendar: {
      enabled: input.calendar?.enabled !== false,
      refreshMinutes: Number(input.calendar?.refreshMinutes || 5),
      maxEvents: Number(input.calendar?.maxEvents || 4),
      includeAllCalendars: input.calendar?.includeAllCalendars !== false,
      calendarNames: Array.isArray(input.calendar?.calendarNames) ? input.calendar.calendarNames : []
    }
  };
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeState(input) {
  const now = new Date().toISOString();

  return {
    version: 1,
    generatedAt: input.generatedAt || now,
    helper: {
      status: "running",
      port: PORT,
      startedAt: input.helper?.startedAt || now,
      lastHeartbeatAt: now
    },
    lastWakeAt: input.lastWakeAt || now,
    wakeSource: input.wakeSource || "helper_start",
    today: {
      summary: input.today?.summary || "No tasks yet. Add one thing worth finishing.",
      weather: input.today?.weather || { status: "unknown", label: "Syncing weather" },
      calendar: input.today?.calendar || { status: "unknown", label: "Syncing calendar", events: [] },
      todos: Array.isArray(input.today?.todos) ? input.today.todos : []
    },
    integrations: {
      obsidian: input.integrations?.obsidian || { status: "not_configured" },
      github: input.integrations?.github || { status: "not_configured" }
    }
  };
}

async function syncIntegrations({ force = false } = {}) {
  settings = await loadSettings();
  const now = Date.now();
  const weatherInterval = Math.max(1, settings.weather.refreshMinutes) * 60 * 1000 || DEFAULT_WEATHER_REFRESH_MS;
  const calendarInterval = Math.max(1, settings.calendar.refreshMinutes) * 60 * 1000 || DEFAULT_CALENDAR_REFRESH_MS;
  let changed = false;

  if (settings.weather.enabled && (force || now - lastWeatherSyncAt >= weatherInterval)) {
    state.today.weather = await syncWeather(settings.weather);
    lastWeatherSyncAt = now;
    changed = true;
  }

  if (settings.calendar.enabled && (force || now - lastCalendarSyncAt >= calendarInterval)) {
    state.today.calendar = await syncCalendar(settings.calendar);
    lastCalendarSyncAt = now;
    changed = true;
  }

  if (changed) {
    state.today.summary = buildDailySummary();
    await saveState("integration_sync", {
      weather: state.today.weather.status,
      calendar: state.today.calendar.status
    });
  }
}

async function syncWeather(weatherSettings) {
  try {
    const location = await resolveWeatherLocation(weatherSettings.location);
    const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
    forecastUrl.searchParams.set("latitude", String(location.latitude));
    forecastUrl.searchParams.set("longitude", String(location.longitude));
    forecastUrl.searchParams.set("current", "temperature_2m,apparent_temperature,weather_code,precipitation,wind_speed_10m");
    forecastUrl.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max");
    forecastUrl.searchParams.set("timezone", weatherSettings.location.timezone || "auto");

    const data = await fetchJson(forecastUrl, 12_000);
    const current = data.current || {};
    const daily = data.daily || {};
    const condition = weatherCodeToText(current.weather_code ?? daily.weather_code?.[0]);
    const temp = Math.round(current.temperature_2m);
    const feels = Math.round(current.apparent_temperature);
    const high = Math.round(daily.temperature_2m_max?.[0]);
    const low = Math.round(daily.temperature_2m_min?.[0]);
    const rain = Math.round(daily.precipitation_probability_max?.[0] ?? current.precipitation ?? 0);

    return {
      status: "online",
      provider: "open-meteo",
      label: `${temp}°C, ${condition}`,
      condition,
      temperatureC: temp,
      apparentTemperatureC: feels,
      highC: Number.isFinite(high) ? high : null,
      lowC: Number.isFinite(low) ? low : null,
      precipitationProbability: Number.isFinite(rain) ? rain : null,
      windKph: finiteOrNull(current.wind_speed_10m),
      location: location.label,
      updatedAt: new Date().toISOString()
    };
  } catch (error) {
    await logEvent("weather_sync_error", { message: error.message });
    return {
      ...(state.today.weather || {}),
      status: "offline",
      label: state.today.weather?.label && state.today.weather.status === "online" ? `${state.today.weather.label} (cached)` : "Weather offline",
      error: error.message,
      updatedAt: state.today.weather?.updatedAt || null
    };
  }
}

async function resolveWeatherLocation(locationSettings) {
  if (Number.isFinite(locationSettings.latitude) && Number.isFinite(locationSettings.longitude)) {
    return {
      latitude: locationSettings.latitude,
      longitude: locationSettings.longitude,
      label: locationSettings.name || `${locationSettings.latitude}, ${locationSettings.longitude}`
    };
  }

  if (locationSettings.name) {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.searchParams.set("name", locationSettings.name);
    url.searchParams.set("count", "1");
    url.searchParams.set("language", "en");
    url.searchParams.set("format", "json");
    const data = await fetchJson(url, 10_000);
    const match = data.results?.[0];
    if (!match) throw new Error(`No weather location found for ${locationSettings.name}`);

    return {
      latitude: match.latitude,
      longitude: match.longitude,
      label: [match.name, match.country_code].filter(Boolean).join(", ")
    };
  }

  const providers = [resolveIpWhoIsLocation, resolveIpApiLocation];
  const errors = [];

  for (const provider of providers) {
    try {
      const location = await provider();
      if (isValidCoordinate(location.latitude, location.longitude)) return location;
      errors.push(`${provider.name} returned invalid coordinates`);
    } catch (error) {
      errors.push(`${provider.name}: ${error.message}`);
    }
  }

  throw new Error(`Auto location failed: ${errors.join("; ")}`);
}

async function resolveIpWhoIsLocation() {
  const data = await fetchJson("https://ipwho.is/", 10_000);
  if (data.success === false) throw new Error(data.message || "ipwho.is failed");

  return {
    latitude: Number(data.latitude),
    longitude: Number(data.longitude),
    label: [data.city, data.country_code].filter(Boolean).join(", ") || "Current location"
  };
}

async function resolveIpApiLocation() {
  const data = await fetchJson("https://ipapi.co/json/", 10_000);

  return {
    latitude: Number(data.latitude),
    longitude: Number(data.longitude),
    label: [data.city, data.country_code].filter(Boolean).join(", ") || "Current location"
  };
}

function isValidCoordinate(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return false;
  return !(Math.abs(latitude) < 0.0001 && Math.abs(longitude) < 0.0001);
}

async function syncCalendar(calendarSettings) {
  try {
    const script = buildCalendarScript(calendarSettings);
    const stdout = await execFileText("/usr/bin/osascript", ["-l", "JavaScript", "-e", script], {
      timeout: 20_000,
      maxBuffer: 1024 * 1024
    });
    const parsed = JSON.parse(stdout.trim() || "{}");
    const events = Array.isArray(parsed.events) ? parsed.events : [];
    const nextEvent = events.find((event) => !event.isAllDay) || events[0] || null;

    return {
      status: "online",
      provider: "macos-calendar",
      label: events.length === 0 ? "No events today" : nextEvent ? `${formatEventTime(nextEvent.startAt)} ${nextEvent.title}` : `${events.length} events today`,
      events,
      updatedAt: new Date().toISOString()
    };
  } catch (error) {
    await logEvent("calendar_sync_error", { message: error.message });
    return {
      ...(state.today.calendar || {}),
      status: "offline",
      label: state.today.calendar?.status === "online" ? `${state.today.calendar.label} (cached)` : "Calendar unavailable",
      error: error.message,
      events: state.today.calendar?.events || [],
      updatedAt: state.today.calendar?.updatedAt || null
    };
  }
}

function buildCalendarScript(calendarSettings) {
  const allowedNames = JSON.stringify(calendarSettings.calendarNames || []);
  const includeAll = calendarSettings.includeAllCalendars ? "true" : "false";
  const maxEvents = Number(calendarSettings.maxEvents || 4);

  return `
const Calendar = Application("Calendar");
const includeAll = ${includeAll};
const allowedNames = ${allowedNames};
const maxEvents = ${maxEvents};
const start = new Date();
start.setHours(0, 0, 0, 0);
const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
const events = [];

for (const calendar of Calendar.calendars()) {
  const calendarName = calendar.name();
  if (!includeAll && !allowedNames.includes(calendarName)) continue;

  for (const event of calendar.events()) {
    const startDate = event.startDate();
    if (!(startDate instanceof Date) || startDate < start || startDate >= end) continue;

    const endDate = event.endDate();
    events.push({
      title: event.summary() || "Untitled",
      calendar: calendarName,
      startAt: startDate.toISOString(),
      endAt: endDate instanceof Date ? endDate.toISOString() : null,
      location: event.location() || null,
      isAllDay: Boolean(event.alldayEvent())
    });
  }
}

events.sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
JSON.stringify({ events: events.slice(0, maxEvents) });
`;
}

function buildDailySummary() {
  const openTasks = state.today.todos.filter((todo) => !todo.done);
  const weather = state.today.weather?.status === "online" ? state.today.weather.label : "weather offline";
  const events = state.today.calendar?.events?.length || 0;
  const taskText = openTasks.length === 0 ? "no open tasks" : `${openTasks.length} open ${openTasks.length === 1 ? "task" : "tasks"}`;
  const eventText = events === 0 ? "no calendar events" : `${events} calendar ${events === 1 ? "event" : "events"}`;

  return `${taskText}, ${eventText}, ${weather}.`;
}

function formatEventTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}

function weatherCodeToText(code) {
  const table = new Map([
    [0, "clear"],
    [1, "mostly clear"],
    [2, "partly cloudy"],
    [3, "cloudy"],
    [45, "fog"],
    [48, "fog"],
    [51, "light drizzle"],
    [53, "drizzle"],
    [55, "heavy drizzle"],
    [61, "light rain"],
    [63, "rain"],
    [65, "heavy rain"],
    [71, "light snow"],
    [73, "snow"],
    [75, "heavy snow"],
    [80, "rain showers"],
    [81, "rain showers"],
    [82, "heavy showers"],
    [95, "thunderstorm"],
    [96, "thunderstorm"],
    [99, "thunderstorm"]
  ]);

  return table.get(Number(code)) || "unknown";
}

async function fetchJson(url, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "CustomBGPlash/0.1" }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function execFileText(command, args, options) {
  return new Promise((resolvePromise, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message));
        return;
      }

      resolvePromise(stdout);
    });
  });
}

async function saveState(eventType, details = {}) {
  const now = new Date().toISOString();
  state.generatedAt = now;
  state.helper.lastHeartbeatAt = now;
  await atomicWrite(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
  await logEvent(eventType, details);
}

async function atomicWrite(filePath, content) {
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(tempPath, content, "utf8");
  await rename(tempPath, filePath);
}

async function logEvent(type, details = {}) {
  const event = {
    type,
    at: new Date().toISOString(),
    details
  };
  await writeFile(EVENTS_FILE, `${JSON.stringify(event)}\n`, { flag: "a" });
}

async function detectWake() {
  const latestWakeAt = await getLatestWakeAt();

  if (!latestWakeAt) return;

  const current = Date.parse(state.lastWakeAt || 0);
  const next = Date.parse(latestWakeAt);

  if (Number.isFinite(next) && next > current) {
    state.lastWakeAt = latestWakeAt;
    state.wakeSource = "pmset";
    await saveState("wake_detected", { lastWakeAt: latestWakeAt });
  }
}

function getLatestWakeAt() {
  return new Promise((resolvePromise) => {
    execFile("/usr/bin/pmset", ["-g", "log"], { timeout: 20_000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
      if (error) {
        resolvePromise(null);
        return;
      }

      const lines = stdout.split("\n").filter((line) => /\bWake\b|DarkWake/.test(line));
      const latest = lines.reverse().find((line) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(line));

      if (!latest) {
        resolvePromise(null);
        return;
      }

      const stamp = latest.slice(0, 19).replace(" ", "T");
      const parsed = new Date(stamp);
      resolvePromise(Number.isNaN(parsed.getTime()) ? null : parsed.toISOString());
    });
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
