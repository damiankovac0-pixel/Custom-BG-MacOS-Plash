# CustomBGPlash

An offline Plash wallpaper for macOS. It starts with a clean black wake screen, greets Damian based on the time of day, shows the current time and date, then fades into a quiet background with a discreet clock/date display.

See `docs/ARCHITECTURE.md` for the planned local helper architecture that will handle wake events, Obsidian, GitHub, weather, calendar, and durable todo storage properly.

## Use With Plash

1. Open Plash.
2. Choose **Add Website...**.
3. Use this local file URL:

```text
file:///Users/damiankovac/Documents/GITHUB/CustomBGPlash/index.html
```

If Plash does not accept a `file://` URL, run a tiny local server from this folder instead:

```sh
python3 -m http.server 4173
```

Then add this URL to Plash:

```text
http://localhost:4173
```

This still works offline because the files are served from your Mac.

## Current Behavior

- First paint is black to avoid a visible flash.
- JavaScript fills in the correct greeting, time, and date before revealing text.
- The intro plays on page load, when the page becomes visible again, and when the window regains focus.
- The clock updates once per minute.
- The dashboard shows a Today panel, weather/calendar placeholders, and an editable todo list.
- Todos are stored locally in the browser with `localStorage`, so they work offline.
- The font stack uses Orbitron if it is installed on the Mac, with local system fallbacks otherwise.

## Editing Todos

Use Plash browsing mode to click into the todo input, add tasks, complete tasks, or remove them.

The data is stored under this local key:

```text
customBGPlash.todos
```

## Greeting Schedule

- Morning starts at 05:00.
- Afternoon starts at 12:00.
- Evening starts at 17:00.
- Night starts at 22:00.

These are defined in `script.js` and can be changed later.
