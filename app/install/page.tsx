import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppInstallOnboarding } from "@/components/pwa/app-install-onboarding";
import { getAppBaseUrl, getCurrentHostType } from "@/lib/domains";

export const metadata: Metadata = {
  title: "Installer DTSC Platform sur mobile et ordinateur",
  description: "Installation guidée de l'application DTSC Platform sur Android, iPhone, iPad, Windows, macOS et Linux.",
  robots: { index: false, follow: true },
};

export default async function InstallPage() {
  const [headersStore, cookieStore] = await Promise.all([headers(), cookies()]);
  const host = getCurrentHostType(headersStore.get("host"));
  // Install prompts are origin-bound: installing on the marketing domain
  // would create the PUBLIC PWA instead of the authenticated SaaS workspace.
  if (host !== "app" && host !== "local") {
    redirect(`${getAppBaseUrl()}/install`);
  }

  const preferred = cookieStore.get("dtsc_locale")?.value || cookieStore.get("NEXT_LOCALE")?.value;
  const locale = preferred === "fr" || preferred === "en"
    ? preferred
    : headersStore.get("accept-language")?.toLowerCase().startsWith("en") ? "en" : "fr";

  return <AppInstallOnboarding locale={locale} />;
}
