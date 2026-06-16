import { Suspense } from "react";
import { headers } from "next/headers";
import { AuthForm } from "@/components/auth/auth-form";
import { DtscLogo } from "@/components/brand/dtsc-logo";
import { DtscFooter } from "@/components/layout/dtsc-footer";
import { ProductNavigation } from "@/components/layout/product-navigation";
import { getSession } from "@/lib/auth";
import { getCurrentHostType } from "@/lib/domains";
import { isDtscInternalSession } from "@/lib/organizations";

export default async function SignUpPage() {
  const [session, requestHeaders] = await Promise.all([getSession(), headers()]);
  const currentHostType = getCurrentHostType(requestHeaders.get("host"));

  return (
    <main className="grid min-h-screen w-full max-w-[100vw] overflow-x-clip bg-dtsc-page text-dtsc-ink lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <section className="relative hidden overflow-hidden border-r border-dtsc-border bg-[#001736] p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-50"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1573164713714-d95e436ab8d6?auto=format&fit=crop&w=1500&q=82')" }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,23,54,0.94),rgba(0,43,91,0.62)),radial-gradient(circle_at_20%_20%,rgba(0,194,255,0.22),transparent_34%)]" />
        <div className="relative w-fit rounded-2xl bg-white/90 p-3 shadow-[0_16px_42px_rgba(0,0,0,0.22)] backdrop-blur">
          <DtscLogo />
        </div>
        <div className="relative">
          <p className="max-w-lg text-4xl font-black leading-tight text-white">Créez votre accès client.</p>
          <p className="mt-4 max-w-md leading-7 text-slate-200">
            Lancez vos premières conversations et structurez vos besoins en data, IA, marketing digital et solutions numériques.
          </p>
          <div className="mt-10 grid gap-3 text-sm text-cyan-50">
            {["Historique de conversations", "Tickets support", "Assistant IA DTSC", "Cadrage conseil"].map((item) => (
              <div key={item} className="rounded-xl border border-cyan-300/25 bg-white/10 px-4 py-3 font-semibold shadow-[0_18px_48px_rgba(0,0,0,0.18)] backdrop-blur-md">
                {item}
              </div>
            ))}
          </div>
        </div>
        <div className="lg:hidden">
          <DtscFooter compact />
        </div>
      </section>
      <section className="relative flex min-w-0 flex-col items-center justify-center gap-6 overflow-hidden px-4 py-10">
        <div
          className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-[0.07]"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=1400&q=80')" }}
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_18%,rgba(0,194,255,0.16),transparent_34%),linear-gradient(180deg,transparent,rgba(232,243,255,0.55))]" />
        <div className="relative w-full max-w-md min-w-0 rounded-2xl border border-dtsc-border bg-dtsc-surface/94 p-8 shadow-[0_24px_80px_rgba(0,43,91,0.16)] backdrop-blur-xl">
          <h1 className="text-2xl font-black text-dtsc-ink">Inscription</h1>
          <p className="mt-2 text-sm text-dtsc-muted">Créez un compte sécurisé DTSC.</p>
          <div className="mt-6">
            <Suspense>
              <AuthForm mode="sign-up" />
            </Suspense>
          </div>
          {session && (
            <ProductNavigation
              currentHostType={currentHostType}
              isDtscInternal={isDtscInternalSession(session)}
              className="mt-6"
            />
          )}
        </div>
        <DtscFooter compact />
      </section>
    </main>
  );
}
