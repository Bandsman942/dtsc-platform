import Link from "next/link";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";

export default function SignUpPage() {
  return (
    <main className="grid min-h-screen bg-slate-950 text-white lg:grid-cols-2">
      <section className="hidden border-r border-white/10 bg-white/[0.03] p-10 lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="font-semibold">DTSC Chatbot</Link>
        <div>
          <p className="text-4xl font-semibold">Créez votre accès client.</p>
          <p className="mt-4 max-w-md text-slate-400">
            Lancez vos premières conversations et structurez vos besoins numériques avec DTSC.
          </p>
        </div>
        <p className="text-sm text-slate-500">Conseil, data, automatisation et IA pour entreprises</p>
      </section>
      <section className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-lg border border-white/10 bg-white/[0.04] p-8">
          <h1 className="text-2xl font-semibold">Inscription</h1>
          <p className="mt-2 text-sm text-slate-400">Créez un compte sécurisé DTSC.</p>
          <div className="mt-6">
            <Suspense>
              <AuthForm mode="sign-up" />
            </Suspense>
          </div>
        </div>
      </section>
    </main>
  );
}
