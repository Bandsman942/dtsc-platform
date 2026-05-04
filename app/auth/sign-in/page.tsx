import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { DtscLogo } from "@/components/brand/dtsc-logo";
import { DtscFooter } from "@/components/layout/dtsc-footer";
import { dtsc } from "@/lib/dtsc";

export default function SignInPage() {
  return (
    <main className="grid min-h-screen bg-dtsc-page text-dtsc-ink lg:grid-cols-[0.95fr_1.05fr]">
      <section className="hidden overflow-hidden border-r border-dtsc-border bg-dtsc-surface p-10 lg:flex lg:flex-col lg:justify-between">
        <DtscLogo />
        <div>
          <p className="max-w-lg text-4xl font-black leading-tight text-dtsc-ink">Accédez à votre espace client DTSC.</p>
          <p className="mt-4 max-w-md leading-7 text-dtsc-muted">
            Retrouvez vos conversations, vos tickets et les recommandations liées à vos projets data, IA, marketing digital et transformation numérique.
          </p>
          <div className="mt-10 rounded-2xl bg-dtsc-soft p-6 text-dtsc-blue shadow-[0_12px_32px_rgba(0,43,91,0.1)]">
            <p className="text-sm font-bold uppercase tracking-wider">Accès sécurisé</p>
            <p className="mt-3 text-sm leading-6">Session protégée, historique sauvegardé et environnement client dédié.</p>
          </div>
        </div>
        <div className="lg:hidden">
          <DtscFooter compact />
        </div>
      </section>
      <section className="flex flex-col items-center justify-center gap-6 px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-dtsc-border bg-dtsc-surface p-8 shadow-[0_18px_60px_rgba(0,43,91,0.12)]">
          <h1 className="text-2xl font-black text-dtsc-ink">Connexion</h1>
          <p className="mt-2 text-sm text-dtsc-muted">Connectez-vous à votre espace {dtsc.name}.</p>
          <div className="mt-6">
            <Suspense>
              <AuthForm mode="sign-in" />
            </Suspense>
          </div>
        </div>
        <DtscFooter compact />
      </section>
    </main>
  );
}
