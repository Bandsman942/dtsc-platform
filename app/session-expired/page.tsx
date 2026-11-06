import { headers } from "next/headers";
import { SessionExpiredCard } from "@/components/auth/session-expired-card";
import { DtscLogo } from "@/components/brand/dtsc-logo";
import { DtscFooter } from "@/components/layout/dtsc-footer";
import { getConsoleUrl, getCurrentHostType, getDashboardUrl, getSignInUrl, getSupportUrl } from "@/lib/domains";

export default async function SessionExpiredPage() {
  const requestHeaders = await headers();
  const hostType = getCurrentHostType(requestHeaders.get("host"));
  const returnUrl = hostType === "console"
    ? getConsoleUrl("/admin")
    : hostType === "support"
      ? getSupportUrl("/support")
      : getDashboardUrl();
  const reconnectUrl = `${getSignInUrl(returnUrl)}&reason=session-expired`;
  return (
    <main className="flex min-h-screen flex-col bg-dtsc-page px-4 py-8 text-dtsc-ink">
      <div className="mx-auto flex w-full max-w-7xl justify-start">
        <DtscLogo />
      </div>
      <section className="flex flex-1 items-center justify-center py-10">
        <SessionExpiredCard reconnectUrl={reconnectUrl} />
      </section>
      <DtscFooter compact />
    </main>
  );
}
