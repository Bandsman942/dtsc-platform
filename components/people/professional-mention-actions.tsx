"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarPlus, Copy, MessageCircle, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

export function ProfessionalMentionActions({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);

  function copyName() {
    void navigator.clipboard?.writeText(name);
    setOpen(false);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="font-black text-cyan-600 underline decoration-cyan-300 underline-offset-4 transition hover:text-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-300" title={`Actions professionnelles pour ${name}`}>
        @{name}
      </button>
      <Dialog open={open} title={name} description="Actions professionnelles disponibles pour ce collaborateur mentionné." onClose={() => setOpen(false)} className="max-w-lg">
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href={`/collaborators?profile=${encodeURIComponent(userId)}`} onClick={() => setOpen(false)} className="flex min-h-20 items-center gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4 font-black text-dtsc-blue hover:border-cyan-300"><UserRound className="h-5 w-5" /> Voir le profil</Link>
          <Link href={`/collaborators?direct=${encodeURIComponent(userId)}`} onClick={() => setOpen(false)} className="flex min-h-20 items-center gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4 font-black text-dtsc-blue hover:border-cyan-300"><MessageCircle className="h-5 w-5" /> Ouvrir la conversation</Link>
          <Link href={`/calendar?inviteUser=${encodeURIComponent(userId)}`} onClick={() => setOpen(false)} className="flex min-h-20 items-center gap-3 rounded-2xl border border-dtsc-border bg-dtsc-page p-4 font-black text-dtsc-blue hover:border-cyan-300"><CalendarPlus className="h-5 w-5" /> Inviter à un événement</Link>
          <Button type="button" variant="outline" onClick={copyName} className="min-h-20 justify-start rounded-2xl border-dtsc-border bg-dtsc-page text-dtsc-blue"><Copy className="h-5 w-5" /> Copier le nom</Button>
        </div>
      </Dialog>
    </>
  );
}
