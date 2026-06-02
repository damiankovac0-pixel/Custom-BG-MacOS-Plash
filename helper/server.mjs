import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DATA_DIR = join(ROOT, "data");
const STATE_FILE = join(DATA_DIR, "state.json");
const EVENTS_FILE = join(DATA_DIR, "events.jsonl");
const PORT = Number(process.env.CUSTOMBGPLASH_PORT || 4173);
const POLL_INTERVAL_MS = 30_000;

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

let state = await loadState();

await mkdir(DATA_DIR, { recursive: true });
await saveState("helper_start");
await detectWake();
setInterval(() => {
  detectWake().catch((error) => logEvent("wake_detect_error", { message: error.message }));
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
      weather: input.today?.weather || { status: "offline", label: "Offline" },
      calendar: input.today?.calendar || { status: "offline", label: "Local soon", events: [] },
      todos: Array.isArray(input.today?.todos) ? input.today.todos : []
    },
    integrations: {
      obsidian: input.integrations?.obsidian || { status: "not_configured" },
      github: input.integrations?.github || { status: "not_configured" }
    }
  };
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
