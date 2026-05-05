import { SessionExpiredCard } from "@/components/auth/session-expired-card";
import { DtscLogo } from "@/components/brand/dtsc-logo";
import { DtscFooter } from "@/components/layout/dtsc-footer";

export default function SessionExpiredPage() {
  return (
    <main className="flex min-h-screen flex-col bg-dtsc-page px-4 py-8 text-dtsc-ink">
      <div className="mx-auto flex w-full max-w-7xl justify-start">
        <DtscLogo />
      </div>
      <section className="flex flex-1 items-center justify-center py-10">
        <SessionExpiredCard />
      </section>
      <DtscFooter compact />
    </main>
  );
}
