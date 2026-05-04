import Link from "next/link";
import { DtscFooter } from "@/components/layout/dtsc-footer";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-dtsc-page px-4 text-dtsc-ink">
      <div className="dtsc-panel max-w-md p-8 text-center">
        <p className="text-sm font-bold text-cyan-600">404</p>
        <h1 className="mt-3 text-4xl font-black text-dtsc-ink">Page introuvable</h1>
        <p className="mt-4 text-dtsc-muted">
          La ressource demandée n&apos;existe pas ou n&apos;est plus disponible.
        </p>
        <Button asChild className="mt-6 rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
          <Link href="/dashboard">Retour au dashboard</Link>
        </Button>
      </div>
      <div className="mt-8">
        <DtscFooter compact />
      </div>
    </main>
  );
}
