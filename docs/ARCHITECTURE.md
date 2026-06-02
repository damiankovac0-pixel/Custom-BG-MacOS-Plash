# CustomBGPlash Architecture

CustomBGPlash should be a local system, not only a webpage. Plash is the display layer. A local helper should own system events, private data access, syncing, and durable storage.

## Goals

- Work offline by default.
- Avoid visual flicker on first paint.
- Replay the intro only for real startup/wake events, not normal desktop focus changes.
- Keep the wallpaper fast and read-only most of the time.
- Integrate Obsidian, Calendar, GitHub, weather, and todos through local data files.

## Components

- Plash wallpaper: renders `index.html`, `styles.css`, and `script.js`.
- Local helper: a long-running process or LaunchAgent that watches system/data sources.
- State file: `data/state.json`, the single file the wallpaper reads.
- Event file: `data/events.jsonl`, append-only events such as wake, sync, todo update, and errors.
- Assets: local fonts and images only.

## Data Flow

```text
macOS wake/calendar + Obsidian vault + GitHub API + weather API + todo storage
↓
local helper
↓
data/state.json + data/events.jsonl
↓
Plash wallpaper
```

## Wake Behavior

Browser focus and visibility events are not reliable wake signals. The proper version should use a macOS LaunchAgent/helper that detects wake and writes an event into `data/state.json`.

The wallpaper should replay the intro only when `state.lastWakeAt` is newer than the last rendered intro. Until the helper exists, the current browser cooldown is temporary.

## Storage

Todos should move out of `localStorage` and into `data/state.json` once the helper exists. `localStorage` is acceptable only for the prototype because Plash cannot write local JSON directly without a helper.

Planned state shape:

```json
{
  "version": 1,
  "generatedAt": "2026-06-02T08:00:00Z",
  "lastWakeAt": "2026-06-02T08:00:00Z",
  "today": {
    "summary": "One focused task, no calendar conflicts.",
    "weather": { "status": "offline", "label": "Offline" },
    "calendar": { "status": "offline", "events": [] },
    "todos": []
  },
  "integrations": {
    "obsidian": { "status": "not_configured" },
    "github": { "status": "not_configured" }
  }
}
```

## Implemented Foundation

- `helper/server.mjs` serves the wallpaper at `http://127.0.0.1:4173`.
- `helper/server.mjs` exposes `/api/state` and `/api/todos`.
- `helper/server.mjs` writes `data/state.json` atomically.
- `helper/server.mjs` appends operational events to `data/events.jsonl`.
- `helper/server.mjs` polls `pmset -g log` for real macOS wake events.
- `scripts/install-launch-agent.mjs` installs the helper as a LaunchAgent.
- `scripts/uninstall-launch-agent.mjs` removes the LaunchAgent.
- Weather sync uses Open-Meteo with IP geolocation or configured coordinates.
- Calendar sync uses macOS Calendar through `osascript`.
- Weather and Calendar render as ambient background signals, not dashboard cards.

## Local Control Plane

It is possible for the helper to open apps, edit local files, and coordinate deeper workflows. That should be implemented as an explicit action broker, not ad-hoc browser JavaScript.

Rules for future local actions:

- Actions must be declared in config.
- Dangerous actions need explicit allowlists.
- Every action writes to `data/events.jsonl`.
- The wallpaper can request actions through helper APIs, but the helper decides what is allowed.
- File edits should target configured directories only, such as an Obsidian vault path.

## Integration Plan

1. Add Obsidian vault reader for daily notes and tasks.
2. Add GitHub sync with offline cache.
3. Add action broker for opening apps and editing allowlisted local files.
4. Add a small diagnostics page for helper health.
5. Add settings UI for integration paths and tokens.

## Principle

The wallpaper should never be responsible for private system access. It should render a local state file. The helper should do the complex work deliberately and observably.
