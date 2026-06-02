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

## Integration Plan

1. Build local helper and LaunchAgent.
2. Move todos from `localStorage` to helper-managed JSON.
3. Add wake detection and intro replay based on `lastWakeAt`.
4. Add Obsidian vault reader for daily notes and tasks.
5. Add GitHub sync with offline cache.
6. Add weather sync with offline cache.
7. Add Calendar sync from macOS Calendar or exported calendars.

## Principle

The wallpaper should never be responsible for private system access. It should render a local state file. The helper should do the complex work deliberately and observably.
