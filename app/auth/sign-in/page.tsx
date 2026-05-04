import Link from "next/link";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";

export default function SignInPage() {
  return (
    <main className="grid min-h-screen bg-[#faf9fe] text-[#1a1c1f] lg:grid-cols-[0.95fr_1.05fr]">
      <section className="hidden overflow-hidden border-r border-slate-200 bg-white p-10 lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="font-extrabold text-[#001736]">DTSC Chatbot</Link>
        <div>
          <p className="max-w-lg text-4xl font-bold leading-tight text-[#001736]">Accédez à votre espace client.</p>
          <p className="mt-4 max-w-md leading-7 text-slate-600">
            Retrouvez vos conversations, suivez vos demandes et échangez avec l&apos;assistant DTSC.
          </p>
          <div className="mt-10 rounded-2xl bg-[#d5e3fd] p-6 text-[#002b5b] shadow-[0_12px_32px_rgba(0,43,91,0.1)]">
            <p className="text-sm font-bold uppercase tracking-wider">Accès sécurisé</p>
            <p className="mt-3 text-sm leading-6">Session protégée, historique sauvegardé et environnement client dédié.</p>
          </div>
        </div>
        <p className="text-sm font-medium text-slate-500">Le numérique au service de votre performance</p>
      </section>
      <section className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-[0_12px_32px_rgba(0,43,91,0.1)]">
          <h1 className="text-2xl font-bold text-[#001736]">Connexion</h1>
          <p className="mt-2 text-sm text-slate-500">Connectez-vous à votre espace DTSC.</p>
          <div className="mt-6">
            <Suspense>
              <AuthForm mode="sign-in" />
            </Suspense>
          </div>
        </div>
      </section>
    </main>
  );
}
