/**
 * withinSeconds for the boot-time wol-flag/consume check, derived from this
 * specific boot's own uptime rather than a fixed guess. os.uptime() is
 * backed by the OS's own tick counter, not wall-clock time, so this scales
 * automatically with however long this specific boot took, without needing
 * the two machines' clocks to agree on anything. bootBufferSeconds covers
 * the separate, small, hardware-dependent gap between the magic packet
 * arriving and Windows actually finishing POST/boot up to this check
 * running — this check fires once at service startup, which happens
 * automatically at boot, so there's no separate boot→login gap to add on
 * top of that.
 */
export function computeWolWithinSeconds(
  uptimeSeconds: number,
  bootBufferSeconds: number,
): number {
  return Math.ceil(uptimeSeconds) + bootBufferSeconds;
}
