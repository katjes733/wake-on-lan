/**
 * withinSeconds for the boot-time wol-flag/consume check, derived from this
 * specific boot's own uptime rather than a fixed guess. os.uptime() is
 * backed by the OS's own tick counter, not wall-clock time, so this scales
 * automatically with however long the gap between power-on and login
 * actually was — whether that's 2 minutes or 40 — without needing the two
 * machines' clocks to agree on anything. bootBufferSeconds covers only the
 * separate, small, hardware-dependent gap between the magic packet arriving
 * and Windows actually finishing POST/boot.
 */
export function computeWolWithinSeconds(
  uptimeSeconds: number,
  bootBufferSeconds: number,
): number {
  return Math.ceil(uptimeSeconds) + bootBufferSeconds;
}
