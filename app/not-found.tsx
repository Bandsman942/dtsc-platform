import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#faf9fe] px-4 text-[#1a1c1f]">
      <div className="dtsc-panel max-w-md p-8 text-center">
        <p className="text-sm font-bold text-cyan-600">404</p>
        <h1 className="mt-3 text-4xl font-bold text-[#001736]">Page introuvable</h1>
        <p className="mt-4 text-slate-600">
          La ressource demandée n&apos;existe pas ou n&apos;est plus disponible.
        </p>
        <Button asChild className="mt-6 rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
          <Link href="/dashboard">Retour au dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
