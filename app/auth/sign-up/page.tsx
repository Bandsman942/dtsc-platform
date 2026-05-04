import Link from "next/link";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";

export default function SignUpPage() {
  return (
    <main className="grid min-h-screen bg-[#faf9fe] text-[#1a1c1f] lg:grid-cols-[0.95fr_1.05fr]">
      <section className="hidden border-r border-slate-200 bg-white p-10 lg:flex lg:flex-col lg:justify-between">
        <Link href="/" className="font-extrabold text-[#001736]">DTSC Chatbot</Link>
        <div>
          <p className="max-w-lg text-4xl font-bold leading-tight text-[#001736]">Créez votre accès client.</p>
          <p className="mt-4 max-w-md leading-7 text-slate-600">
            Lancez vos premières conversations et structurez vos besoins numériques avec DTSC.
          </p>
          <div className="mt-10 grid gap-3 text-sm text-slate-700">
            {["Historique de conversations", "Tickets support", "Assistant IA DTSC"].map((item) => (
              <div key={item} className="rounded-xl border border-slate-200 bg-[#faf9fe] px-4 py-3 font-medium">
                {item}
              </div>
            ))}
          </div>
        </div>
        <p className="text-sm font-medium text-slate-500">Conseil, data, automatisation et IA pour entreprises</p>
      </section>
      <section className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-[0_12px_32px_rgba(0,43,91,0.1)]">
          <h1 className="text-2xl font-bold text-[#001736]">Inscription</h1>
          <p className="mt-2 text-sm text-slate-500">Créez un compte sécurisé DTSC.</p>
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
