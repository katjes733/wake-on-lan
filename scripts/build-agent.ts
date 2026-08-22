// Wraps `bun build --compile` for the agent binary. --windows-icon only
// works when compiling natively on Windows (Bun can't inject PE resources
// cross-platform) — CI builds on windows-latest so it always gets the icon,
// but a local build from this Mac would otherwise fail outright rather than
// just shipping without one.
const args = [
  "build",
  "--compile",
  "--minify",
  ...(process.platform === "win32"
    ? ["--windows-icon=installer/icon.ico"]
    : []),
  "--outfile=installer/dist/wake-on-lan-agent.exe",
  "src/agent/main.ts",
];

if (process.platform !== "win32") {
  console.log(
    "Not on Windows — building without --windows-icon (the exe will use the default icon).",
  );
}

const proc = Bun.spawn(["bun", ...args], {
  stdio: ["inherit", "inherit", "inherit"],
});
process.exit(await proc.exited);
