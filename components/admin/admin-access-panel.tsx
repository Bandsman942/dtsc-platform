"use client";

import { useState, type FormEvent } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { adminBlocks, type AdminRoleAccess } from "@/lib/admin-access";

const configurableRoles = ["MANAGER", "SUPPORT"] as const;

export function AdminAccessPanel({ access }: { access: AdminRoleAccess }) {
  const [message, setMessage] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(
      configurableRoles.map((role) => [role, form.getAll(role).map(String)])
    );

    const response = await fetch("/api/admin/access", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setMessage(response.ok ? "Droits d'administration enregistrés." : "Impossible d'enregistrer les droits d'administration.");
  }

  return (
    <section className="dtsc-card min-w-0 overflow-hidden p-4 sm:p-6">
      <div className="flex min-w-0 items-start gap-3">
        <span className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-300">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-black uppercase tracking-[0.16em] text-cyan-600">RBAC administration</p>
          <h2 className="mt-1 break-words text-2xl font-black text-dtsc-ink">Accès par blocs pour les rôles non-client</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-dtsc-muted">
            Le rôle ADMIN conserve toujours tous les blocs. Vous pouvez ouvrir uniquement les sections utiles aux rôles MANAGER et SUPPORT.
          </p>
        </div>
      </div>

      <form onSubmit={save} className="mt-5 grid min-w-0 gap-5 lg:grid-cols-2">
        {configurableRoles.map((role) => (
          <div key={role} className="min-w-0 overflow-hidden rounded-2xl border border-dtsc-border bg-dtsc-page p-4">
            <h3 className="font-black text-dtsc-ink">{role}</h3>
            <div className="mt-4 grid min-w-0 gap-3">
              {adminBlocks.map((block) => (
                <label key={`${role}-${block.id}`} title={block.description} className="flex min-w-0 items-start justify-between gap-4 rounded-xl border border-dtsc-border bg-dtsc-surface px-4 py-3 text-sm text-dtsc-ink">
                  <span className="min-w-0">
                    <span className="block break-words font-black">{block.label}</span>
                    <span className="mt-1 block break-words text-xs leading-5 text-dtsc-muted">{block.description}</span>
                  </span>
                  <input
                    name={role}
                    value={block.id}
                    type="checkbox"
                    defaultChecked={access[role].includes(block.id)}
                    className="mt-1 h-4 w-4 shrink-0 accent-cyan-500"
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
        <div className="lg:col-span-2">
          <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]" title="Enregistrer les droits d'accès aux blocs Administration.">
            Enregistrer les droits RBAC
          </Button>
        </div>
      </form>

      <Dialog open={Boolean(message)} title="Droits Administration" onClose={() => setMessage("")}>
        <p className="text-sm leading-7 text-dtsc-muted">{message}</p>
      </Dialog>
    </section>
  );
}
