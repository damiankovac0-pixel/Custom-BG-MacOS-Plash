import { rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const LABEL = "com.damiankovac.custombgplash.helper";
const PLIST_PATH = join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);

runLaunchctl(["bootout", `gui/${process.getuid()}`, PLIST_PATH], true);
await rm(PLIST_PATH, { force: true });

console.log(`Uninstalled ${LABEL}`);

function runLaunchctl(args, allowFailure = false) {
  try {
    execFileSync("/bin/launchctl", args, { stdio: allowFailure ? "ignore" : "inherit" });
  } catch (error) {
    if (!allowFailure) throw error;
  }
}
