"use client";

import { useState } from "react";
import { BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

type AccountInfo = {
  name: string;
  email: string;
  companyName: string;
  phone: string;
  role: string;
  createdAt: string;
};

export function ProfileAccountInfo({ account }: { account: AccountInfo }) {
  const [open, setOpen] = useState(false);
  const rows = [
    ["Nom", account.name],
    ["Email", account.email],
    ["Entreprise", account.companyName],
    ["Téléphone", account.phone],
    ["Rôle", account.role],
    ["Inscription", account.createdAt],
  ];

  return (
    <>
      <div className="rounded-2xl border border-dtsc-border bg-dtsc-page p-5">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-600">Informations du compte</p>
        <h3 className="mt-1 text-xl font-black text-dtsc-ink">{account.name}</h3>
        <p className="mt-2 text-sm font-semibold text-dtsc-muted">{account.email} · {account.role}</p>
        <Button type="button" onClick={() => setOpen(true)} className="mt-5 rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
          <BadgeCheck className="h-4 w-4" />
          Voir les informations du compte
        </Button>
      </div>

      <Dialog open={open} title="Informations du compte" description="Consultez les données principales associées à votre compte DTSC Platform." onClose={() => setOpen(false)} className="h-[92dvh] max-w-4xl">
        <dl className="grid gap-4 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
              <dt className="text-xs font-black uppercase tracking-[0.12em] text-dtsc-muted">{label}</dt>
              <dd className="mt-2 break-words text-sm font-black text-dtsc-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </Dialog>
    </>
  );
}
