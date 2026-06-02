# CustomBGPlash

An offline Plash wallpaper for macOS. It starts with a clean black wake screen, greets Damian based on the time of day, shows the current time and date, then fades into a quiet background with a discreet clock/date display.

See `docs/ARCHITECTURE.md` for the planned local helper architecture that will handle wake events, Obsidian, GitHub, weather, calendar, and durable todo storage properly.

## Install The Local Helper

The proper setup is to run the local helper. It serves the wallpaper, owns `data/state.json`, detects macOS wake events, and stores todos outside the browser.

```sh
npm run install-helper
```

Then use this URL in Plash:

```text
http://127.0.0.1:4173
```

To uninstall the helper:

```sh
npm run uninstall-helper
```

## Fallback Use With Plash

1. Open Plash.
2. Choose **Add Website...**.
3. Prefer the helper URL:

```text
http://127.0.0.1:4173
```

If you are not running the helper, use this local file URL:

```text
file:///Users/damiankovac/Documents/GITHUB/CustomBGPlash/index.html
```

Or run a temporary server from this folder:

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
- With the helper, the intro plays from helper state instead of normal desktop focus changes.
- The clock updates once per minute.
- The dashboard shows a Today panel, weather/calendar placeholders, and an editable todo list.
- With the helper, todos are stored in `data/state.json`. Without it, the page falls back to `localStorage`.
- Orbitron is bundled locally in `fonts/`, so it works offline.
- Weather sync uses internet access with Open-Meteo and automatic IP-based location unless configured otherwise.
- Calendar sync reads macOS Calendar locally through the helper. macOS may ask for permission the first time.

## Configure Weather And Calendar

The helper uses `config/settings.example.json` by default. To customize it, create `config/settings.json`.

Use automatic IP-based weather location:

```json
{
  "weather": {
    "enabled": true,
    "location": { "mode": "autoIp" }
  }
}
```

Or pin a location manually:

```json
{
  "weather": {
    "enabled": true,
    "location": {
      "name": "Bratislava",
      "latitude": 48.1486,
      "longitude": 17.1077,
      "timezone": "auto"
    }
  }
}
```

Calendar settings can limit which calendars are read:

```json
{
  "calendar": {
    "enabled": true,
    "includeAllCalendars": false,
    "calendarNames": ["Home", "Work"]
  }
}
```

After changing settings, restart the helper:

```sh
npm run install-helper
```

## Editing Todos

Use Plash browsing mode to click into the todo input, add tasks, complete tasks, or remove them.

With the helper running, data is stored here:

```text
data/state.json
```

Without the helper, the fallback data is stored under this local browser key:

```text
customBGPlash.todos
```

## Greeting Schedule

- Morning starts at 05:00.
- Afternoon starts at 12:00.
- Evening starts at 17:00.
- Night starts at 22:00.

These are defined in `script.js` and can be changed later.
