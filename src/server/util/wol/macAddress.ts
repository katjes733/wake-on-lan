const MAC_HEX_PATTERN = /^[0-9a-fA-F]{12}$/;

/**
 * Normalizes a MAC address to uppercase "AA:BB:CC:DD:EE:FF" form, accepting
 * ":" or "-" separators or no separator at all. Returns null if the input
 * isn't a valid 12-hex-digit MAC.
 */
export function normalizeMacAddress(input: string): string | null {
  const hex = input.replace(/[:-]/g, "");
  if (!MAC_HEX_PATTERN.test(hex)) return null;
  const upper = hex.toUpperCase();
  return upper.match(/.{2}/g)!.join(":");
}

export function macAddressToBytes(mac: string): Buffer {
  const normalized = normalizeMacAddress(mac);
  if (!normalized) throw new Error(`Invalid MAC address: ${mac}`);
  return Buffer.from(normalized.replace(/:/g, ""), "hex");
}
