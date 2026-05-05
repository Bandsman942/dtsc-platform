"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock3, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SessionExpiredCard() {
  const router = useRouter();
  const [seconds, setSeconds] = useState(8);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(interval);
          router.push("/auth/sign-in?reason=session-expired");
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [router]);

  return (
    <div className="w-full max-w-xl rounded-[1.5rem] border border-dtsc-border bg-dtsc-surface p-8 text-center shadow-[0_24px_80px_rgba(0,23,54,0.16)]">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-dtsc-soft text-dtsc-blue">
        <LockKeyhole className="h-8 w-8" />
      </div>
      <p className="mt-6 text-sm font-black uppercase tracking-[0.18em] text-cyan-600">Session expirée</p>
      <h1 className="mt-3 text-3xl font-black text-dtsc-ink">Votre espace DTSC a été verrouillé.</h1>
      <p className="mt-4 leading-7 text-dtsc-muted">
        Pour protéger vos conversations, tickets et données de compte, la session se ferme automatiquement après 5 minutes sans activité.
      </p>
      <div className="mx-auto mt-6 flex w-fit items-center gap-2 rounded-2xl border border-dtsc-border bg-dtsc-page px-4 py-3 text-sm font-black text-dtsc-blue">
        <Clock3 className="h-4 w-4 text-cyan-500" />
        Redirection vers la connexion dans {seconds}s
      </div>
      <Button asChild className="mt-7 rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
        <Link href="/auth/sign-in?reason=session-expired">Se reconnecter maintenant</Link>
      </Button>
    </div>
  );
}
