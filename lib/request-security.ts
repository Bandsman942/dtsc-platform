export function isSameOriginRequest(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) {
    return true;
  }

  const requestHost = req.headers.get("x-forwarded-host") || req.headers.get("host") || new URL(req.url).host;
  try {
    return new URL(origin).host === requestHost;
  } catch {
    return false;
  }
}
