import { Suspense } from "react";
import { headers } from "next/headers";
import { AuthForm } from "@/components/auth/auth-form";
import { DtscLogo } from "@/components/brand/dtsc-logo";
import { DtscFooter } from "@/components/layout/dtsc-footer";
import { ProductNavigation } from "@/components/layout/product-navigation";
import { getSession } from "@/lib/auth";
import { getCurrentHostType } from "@/lib/domains";
import { dtsc } from "@/lib/dtsc";
import { isDtscInternalSession } from "@/lib/organizations";

export default async function SignInPage() {
  const [session, requestHeaders] = await Promise.all([getSession(), headers()]);
  const currentHostType = getCurrentHostType(requestHeaders.get("host"));

  return (
    <main className="grid min-h-screen bg-dtsc-page text-dtsc-ink lg:grid-cols-[0.95fr_1.05fr]">
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
          <p className="max-w-lg text-4xl font-black leading-tight text-white">Accédez à votre espace client DTSC.</p>
          <p className="mt-4 max-w-md leading-7 text-slate-200">
            Retrouvez vos conversations, vos tickets et les recommandations liées aux 7 leviers numériques DTSC.
          </p>
          <div className="mt-10 rounded-2xl border border-cyan-300/25 bg-white/10 p-6 text-cyan-50 shadow-[0_18px_48px_rgba(0,0,0,0.24)] backdrop-blur-md">
            <p className="text-sm font-bold uppercase tracking-wider">Accès sécurisé</p>
            <p className="mt-3 text-sm leading-6">Session protégée, historique sauvegardé et environnement client dédié.</p>
          </div>
        </div>
        <div className="lg:hidden">
          <DtscFooter compact />
        </div>
      </section>
      <section className="relative flex flex-col items-center justify-center gap-6 overflow-hidden px-4 py-10">
        <div
          className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-[0.07]"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=1400&q=80')" }}
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_18%,rgba(0,194,255,0.16),transparent_34%),linear-gradient(180deg,transparent,rgba(232,243,255,0.55))]" />
        <div className="relative w-full max-w-md rounded-2xl border border-dtsc-border bg-dtsc-surface/94 p-8 shadow-[0_24px_80px_rgba(0,43,91,0.16)] backdrop-blur-xl">
          <h1 className="text-2xl font-black text-dtsc-ink">Connexion</h1>
          <p className="mt-2 text-sm text-dtsc-muted">Connectez-vous à votre espace {dtsc.name}.</p>
          <div className="mt-6">
            <Suspense>
              <AuthForm mode="sign-in" />
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
