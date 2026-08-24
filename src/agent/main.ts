import {
  loadConfigOrEmpty,
  resolveAgentConfig,
  defaultConfigPath,
} from "~/agent/config";
import { runService } from "~/agent/service";

// Defaults to a config.json next to the running executable, but overridable
// — useful for running two independently-configured instances side by side
// during local testing, without needing two separate install directories.
// A fresh install ships no config.json at all — loadConfigOrEmpty tolerates
// that, and resolveAgentConfig fills in serverBaseUrl/targetId via LAN
// discovery + MAC-based self-identification, persisting the result so
// every later start skips straight to the fast path.
const configArg = process.argv.find((arg) => arg.startsWith("--config="));
const configPath = configArg?.slice("--config=".length) ?? defaultConfigPath();
const fileConfig = loadConfigOrEmpty(configPath);
const config = await resolveAgentConfig(fileConfig, configPath);

await runService(config);
