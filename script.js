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

let introTimers = [];
let lastIntroAt = 0;
let todos = loadTodos();

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

function loadTodos() {
  try {
    const saved = JSON.parse(localStorage.getItem("customBGPlash.todos") || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveTodos() {
  localStorage.setItem("customBGPlash.todos", JSON.stringify(todos));
}

function updateTodaySummary() {
  const openTasks = todos.filter((todo) => !todo.done);

  if (openTasks.length === 0) {
    todayHeadline.textContent = "Clear runway.";
    todaySummary.textContent = "No open tasks. Add one thing worth finishing.";
    return;
  }

  todayHeadline.textContent = openTasks.length === 1 ? "One target." : `${openTasks.length} targets.`;
  todaySummary.textContent = `Top priority: ${openTasks[0].text}`;
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

    checkbox.addEventListener("change", () => {
      todo.done = checkbox.checked;
      saveTodos();
      renderTodos();
    });

    remove.addEventListener("click", () => {
      todos = todos.filter((itemTodo) => itemTodo.id !== todo.id);
      saveTodos();
      renderTodos();
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

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) playIntro();
});

todoForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const text = todoInput.value.trim();
  if (!text) return;

  todos.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    text,
    done: false
  });
  todoInput.value = "";
  saveTodos();
  renderTodos();
});

updateTime();
renderTodos();
scheduleMinuteTick();
window.addEventListener("focus", () => playIntro());
window.addEventListener("pageshow", () => playIntro());
window.requestAnimationFrame(() => playIntro({ force: true }));
