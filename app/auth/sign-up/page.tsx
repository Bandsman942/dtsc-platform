import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { DtscLogo } from "@/components/brand/dtsc-logo";
import { DtscFooter } from "@/components/layout/dtsc-footer";

export default function SignUpPage() {
  return (
    <main className="grid min-h-screen bg-dtsc-page text-dtsc-ink lg:grid-cols-[0.95fr_1.05fr]">
      <section className="hidden border-r border-dtsc-border bg-dtsc-surface p-10 lg:flex lg:flex-col lg:justify-between">
        <DtscLogo />
        <div>
          <p className="max-w-lg text-4xl font-black leading-tight text-dtsc-ink">Créez votre accès client.</p>
          <p className="mt-4 max-w-md leading-7 text-dtsc-muted">
            Lancez vos premières conversations et structurez vos besoins en data, IA, marketing digital et solutions numériques.
          </p>
          <div className="mt-10 grid gap-3 text-sm text-dtsc-ink">
            {["Historique de conversations", "Tickets support", "Assistant IA DTSC", "Cadrage conseil"].map((item) => (
              <div key={item} className="rounded-xl border border-dtsc-border bg-dtsc-page px-4 py-3 font-semibold">
                {item}
              </div>
            ))}
          </div>
        </div>
        <div className="lg:hidden">
          <DtscFooter compact />
        </div>
      </section>
      <section className="flex flex-col items-center justify-center gap-6 px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-dtsc-border bg-dtsc-surface p-8 shadow-[0_18px_60px_rgba(0,43,91,0.12)]">
          <h1 className="text-2xl font-black text-dtsc-ink">Inscription</h1>
          <p className="mt-2 text-sm text-dtsc-muted">Créez un compte sécurisé DTSC.</p>
          <div className="mt-6">
            <Suspense>
              <AuthForm mode="sign-up" />
            </Suspense>
          </div>
        </div>
        <DtscFooter compact />
      </section>
    </main>
  );
}
