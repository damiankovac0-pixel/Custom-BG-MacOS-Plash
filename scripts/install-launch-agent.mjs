import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const LABEL = "com.damiankovac.custombgplash.helper";
const PLIST_PATH = join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
const NODE_PATH = process.execPath;
const SERVER_PATH = join(ROOT, "helper", "server.mjs");
const LOG_DIR = join(ROOT, "logs");

await mkdir(dirname(PLIST_PATH), { recursive: true });
await mkdir(LOG_DIR, { recursive: true });

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(NODE_PATH)}</string>
    <string>${escapeXml(SERVER_PATH)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${escapeXml(ROOT)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapeXml(join(LOG_DIR, "helper.out.log"))}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(join(LOG_DIR, "helper.err.log"))}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>CUSTOMBGPLASH_PORT</key>
    <string>4173</string>
  </dict>
</dict>
</plist>
`;

await writeFile(PLIST_PATH, plist, "utf8");

runLaunchctl(["bootout", `gui/${process.getuid()}`, PLIST_PATH], true);
runLaunchctl(["bootstrap", `gui/${process.getuid()}`, PLIST_PATH]);
runLaunchctl(["enable", `gui/${process.getuid()}/${LABEL}`], true);
runLaunchctl(["kickstart", "-k", `gui/${process.getuid()}/${LABEL}`], true);

console.log(`Installed ${LABEL}`);
console.log(`Plash URL: http://127.0.0.1:4173`);

function runLaunchctl(args, allowFailure = false) {
  try {
    execFileSync("/bin/launchctl", args, { stdio: allowFailure ? "ignore" : "inherit" });
  } catch (error) {
    if (!allowFailure) throw error;
  }
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
