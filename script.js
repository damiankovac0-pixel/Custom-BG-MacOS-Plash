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

const greeting = document.querySelector("#greeting");
const phaseLabel = document.querySelector("#phaseLabel");
const introTime = document.querySelector("#introTime");
const introDate = document.querySelector("#introDate");
const ambientTime = document.querySelector("#ambientTime");
const ambientDate = document.querySelector("#ambientDate");
const todayHeadline = document.querySelector("#todayHeadline");
const todaySummary = document.querySelector("#todaySummary");
const todoForm = document.querySelector("#todoForm");
const todoInput = document.querySelector("#todoInput");
const todoList = document.querySelector("#todoList");
const weatherSignal = document.querySelector("#weatherSignal");
const calendarSignal = document.querySelector("#calendarSignal");

let introTimers = [];
let lastIntroAt = 0;
let appState = null;
let todos = [];

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

function loadFallbackTodos() {
  try {
    const saved = JSON.parse(localStorage.getItem("customBGPlash.todos") || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveFallbackTodos() {
  localStorage.setItem("customBGPlash.todos", JSON.stringify(todos));
}

async function fetchState() {
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) throw new Error(`State request failed: ${response.status}`);
    appState = await response.json();
    todos = Array.isArray(appState.today?.todos) ? appState.today.todos : [];
  } catch {
    appState = null;
    todos = loadFallbackTodos();
  }

  renderSignals();
  renderTodos();
}

function renderSignals() {
  const weather = appState?.today?.weather;
  const calendar = appState?.today?.calendar;

  weatherSignal.textContent = weather?.status === "online"
    ? `Weather ${weather.label}${weather.location ? `, ${weather.location}` : ""}`
    : weather?.label || "Weather offline";
  calendarSignal.textContent = calendar?.status === "online"
    ? `Calendar ${calendar.label}`
    : calendar?.label || "Calendar unavailable";

  weatherSignal.dataset.status = weather?.status || "offline";
  calendarSignal.dataset.status = calendar?.status || "offline";
}

async function addTodo(text) {
  if (!appState) {
    todos.unshift({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      text,
      done: false
    });
    saveFallbackTodos();
    renderTodos();
    return;
  }

  const response = await fetch("/api/todos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });

  if (!response.ok) throw new Error(`Todo add failed: ${response.status}`);
  appState = await response.json();
  todos = appState.today.todos;
  renderTodos();
}

async function updateTodo(id, patch) {
  if (!appState) {
    const todo = todos.find((item) => item.id === id);
    if (todo) Object.assign(todo, patch);
    saveFallbackTodos();
    renderTodos();
    return;
  }

  const response = await fetch(`/api/todos/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch)
  });

  if (!response.ok) throw new Error(`Todo update failed: ${response.status}`);
  appState = await response.json();
  todos = appState.today.todos;
  renderTodos();
}

async function removeTodo(id) {
  if (!appState) {
    todos = todos.filter((todo) => todo.id !== id);
    saveFallbackTodos();
    renderTodos();
    return;
  }

  const response = await fetch(`/api/todos/${encodeURIComponent(id)}`, { method: "DELETE" });

  if (!response.ok) throw new Error(`Todo remove failed: ${response.status}`);
  appState = await response.json();
  todos = appState.today.todos;
  renderTodos();
}

function updateTodaySummary() {
  const openTasks = todos.filter((todo) => !todo.done);

  if (appState?.today?.summary) {
    todaySummary.textContent = appState.today.summary;
  }

  if (openTasks.length === 0) {
    todayHeadline.textContent = "Clear runway.";
    if (!appState?.today?.summary) {
      todaySummary.textContent = "No open tasks. Add one thing worth finishing.";
    }
    return;
  }

  todayHeadline.textContent = openTasks.length === 1 ? "One target." : `${openTasks.length} targets.`;
  if (!appState?.today?.summary) {
    todaySummary.textContent = `Top priority: ${openTasks[0].text}`;
  }
}

function renderTodos() {
  todoList.replaceChildren();

  todos.forEach((todo) => {
    const item = document.createElement("li");
    const checkbox = document.createElement("input");
    const label = document.createElement("span");
    const remove = document.createElement("button");

    item.classList.toggle("done", todo.done);
    checkbox.type = "checkbox";
    checkbox.checked = todo.done;
    checkbox.setAttribute("aria-label", `Mark ${todo.text} complete`);
    label.textContent = todo.text;
    remove.type = "button";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove ${todo.text}`);

    checkbox.addEventListener("change", async () => {
      await updateTodo(todo.id, { done: checkbox.checked });
    });

    remove.addEventListener("click", async () => {
      await removeTodo(todo.id);
    });

    item.append(checkbox, label, remove);
    todoList.append(item);
  });

  updateTodaySummary();
}

function scheduleMinuteTick() {
  const now = new Date();
  const delay = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds());

  window.setTimeout(() => {
    updateTime();
    scheduleMinuteTick();
  }, delay);
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

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) updateTime();
});

todoForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const text = todoInput.value.trim();
  if (!text) return;

  todoInput.value = "";
  await addTodo(text);
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
