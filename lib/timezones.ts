/** Canonical IANA time zones supported by the active JavaScript runtime. */
export function supportedTimeZones(): string[] {
  const zones = typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : [];
  return [...new Set(["UTC", ...zones])].sort((a, b) => a.localeCompare(b));
}

export function isSupportedTimeZone(value: string): boolean {
  if (value === "UTC") return true;
  try {
    // Accept aliases supported by Intl as well as canonical zones. The server
    // remains authoritative if the browser uses a different ICU snapshot.
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
