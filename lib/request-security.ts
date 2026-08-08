function firstForwardedValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || null;
}

function effectiveRequestOrigin(req: Request) {
  const requestUrl = new URL(req.url);
  const forwardedHost = firstForwardedValue(req.headers.get("x-forwarded-host"));
  const requestHost = forwardedHost || req.headers.get("host") || requestUrl.host;
  const forwardedProto = firstForwardedValue(req.headers.get("x-forwarded-proto"));
  const requestProtocol = (forwardedProto || requestUrl.protocol.replace(":", "")).toLowerCase();

  if (!requestHost || (requestProtocol !== "http" && requestProtocol !== "https")) {
    return null;
  }

  try {
    return new URL(`${requestProtocol}://${requestHost}`).origin;
  } catch {
    return null;
  }
}

export function isSameOriginRequest(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) {
    return true;
  }

  const expectedOrigin = effectiveRequestOrigin(req);
  if (!expectedOrigin) {
    return false;
  }

  try {
    return new URL(origin).origin === expectedOrigin;
  } catch {
    return false;
  }
}
