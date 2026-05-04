import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
      <div className="max-w-md text-center">
        <p className="text-sm text-cyan-200">404</p>
        <h1 className="mt-3 text-4xl font-semibold">Page introuvable</h1>
        <p className="mt-4 text-slate-400">
          La ressource demandée n&apos;existe pas ou n&apos;est plus disponible.
        </p>
        <Button asChild className="mt-6 bg-cyan-400 text-slate-950 hover:bg-cyan-300">
          <Link href="/dashboard">Retour au dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
