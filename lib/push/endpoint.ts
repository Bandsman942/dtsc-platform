const forbiddenHostPatterns = [
  /^localhost$/i,
  /\.localhost$/i,
  /\.local$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\./,
  /^\[?::1\]?$/i,
  /^\[?f[cd][0-9a-f:]*\]?$/i,
  /^\[?fe8[0-9a-f:]*\]?$/i,
];

export function isAllowedPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    if (url.port && url.port !== "443") return false;
    const hostname = url.hostname.toLowerCase();
    if (!hostname || forbiddenHostPatterns.some((pattern) => pattern.test(hostname))) return false;
    if (!hostname.includes(".") && !hostname.includes(":")) return false;
    return true;
  } catch {
    return false;
  }
}
