import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getAuthCookieDomain } from "@/lib/domains";
import { shouldUseSecureSessionCookie } from "@/lib/session-cookie-security";
import { sendZohoOutboundMail } from "@/lib/zoho-mail";
import { writeAuditLog } from "@/lib/audit";

const COOKIE = "dtsc_known_browser";
const MAX_AGE = 180 * 24 * 60 * 60;

function digest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
function cookieOptions(maxAge = MAX_AGE) {
  const domain = getAuthCookieDomain();
  return {
    httpOnly: true, secure: shouldUseSecureSessionCookie(), sameSite: "lax" as const,
    path: "/", maxAge, ...(domain ? { domain } : {}),
  };
}

export async function getCurrentKnownBrowser(userId: string) {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return prisma.authKnownBrowser.findFirst({
    where: { userId, tokenHash: digest(token), revokedAt: null },
    select: { id: true, trustedAt: true, trustedUntil: true, lastSeenAt: true },
  });
}

/** Notification-only marker; this token NEVER grants authentication or skips TOTP. */
export async function recordAuthenticatedBrowser(req: Request, user: { id: string; email: string; name: string }) {
  try {
    const previous = await getCurrentKnownBrowser(user.id);
    if (previous) {
      await prisma.authKnownBrowser.updateMany({
        where: { id: previous.id, userId: user.id, revokedAt: null },
        data: { lastSeenAt: new Date() },
      });
      return;
    }
    const token = randomBytes(32).toString("base64url");
    const agent = (req.headers.get("user-agent") || "Navigateur non identifié").slice(0, 160);
    const record = await prisma.authKnownBrowser.create({
      data: { userId: user.id, tokenHash: digest(token), agentLabel: agent },
      select: { id: true },
    });
    (await cookies()).set(COOKIE, token, cookieOptions());
    await writeAuditLog({
      userId: user.id, action: "AUTH_BROWSER_FIRST_SEEN",
      entity: "AuthKnownBrowser", entityId: record.id, request: req,
      riskLevel: "MEDIUM",
    });
    // Best effort: email outages must not strand a successfully verified login.
    try {
      const sent = await sendZohoOutboundMail({
        deliveryMode: "direct", to: [user.email],
        subject: "DTSC Platform — Nouvelle connexion détectée",
        heading: "Alerte de sécurité de votre compte",
        source: "auth-new-browser-alert",
        message: [
          "Bonjour " + user.name + ",",
          "",
          "Une connexion à DTSC Platform vient d'être établie depuis un navigateur qui n'était pas encore reconnu.",
          "Navigateur déclaré : " + agent,
          "Date (UTC) : " + new Date().toISOString(),
          "",
          "Si vous n'êtes pas à l'origine de cette connexion, changez votre mot de passe et révoquez les autres sessions depuis Paramètres > Sécurité.",
          "Aucun mot de passe, secret TOTP ni code de récupération n'est contenu dans cette notification.",
        ].join("\n"),
      });
      if (sent.sent) await prisma.authKnownBrowser.update({
        where: { id: record.id }, data: { notificationAt: new Date() },
      });
    } catch {
      // Persist an audit signal without storing provider error bodies/secrets.
      await writeAuditLog({
        userId: user.id, action: "AUTH_BROWSER_ALERT_DELIVERY_FAILED",
        entity: "AuthKnownBrowser", entityId: record.id, request: req,
        result: "FAILED", riskLevel: "MEDIUM",
      }).catch(() => undefined);
    }
  } catch {
    // Alerting is deliberately not an authentication dependency.
  }
}
