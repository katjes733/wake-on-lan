import { loadConfig } from "~/agent/config";
import { runService } from "~/agent/service";
import { runBootHooks } from "~/agent/bootHooks";

const modeArg = process.argv.find((arg) => arg.startsWith("--mode="));
const mode = modeArg?.slice("--mode=".length);

if (mode !== "service" && mode !== "boot-hooks") {
  console.error(
    "Usage: wake-on-lan-agent.exe --mode=service|boot-hooks\n" +
      "  service:     SYSTEM-run background loop — heartbeat + shutdown polling.\n" +
      "  boot-hooks:  one-shot, run at logon — WOL-boot detection + script execution.",
  );
  process.exit(1);
}

// Defaults to a config.json next to the running executable, but overridable
// — useful for running two independently-configured instances side by side
// during local testing, without needing two separate install directories.
const configArg = process.argv.find((arg) => arg.startsWith("--config="));
const config = loadConfig(configArg?.slice("--config=".length));

if (mode === "service") {
  await runService(config);
} else {
  await runBootHooks(config);
}
