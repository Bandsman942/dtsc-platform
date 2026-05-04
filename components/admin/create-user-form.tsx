"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CreateUserForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setMessage(response.ok ? "Compte utilisateur créé." : "Impossible de créer ce compte.");
    if (response.ok) {
      event.currentTarget.reset();
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
      <Input name="name" placeholder="Nom complet" required />
      <Input name="email" type="email" placeholder="Email" required />
      <Input name="password" type="password" placeholder="Mot de passe temporaire" required />
      <select name="role" className="h-10 rounded-xl border border-dtsc-border bg-dtsc-surface px-3 text-sm text-dtsc-ink">
        <option value="CLIENT">CLIENT</option>
        <option value="SUPPORT">SUPPORT</option>
        <option value="MANAGER">MANAGER</option>
        <option value="ADMIN">ADMIN</option>
      </select>
      <Input name="companyName" placeholder="Entreprise" />
      <Input name="phone" placeholder="Téléphone" />
      <Input name="dailyMessageLimit" type="number" defaultValue={30} min={1} max={1000} />
      <Input name="dailyTokenLimit" type="number" defaultValue={100000} min={1000} max={2000000} />
      <div className="md:col-span-2 flex flex-wrap items-center gap-3">
        <Button className="rounded-xl bg-[#002b5b] text-white hover:bg-[#001736]">
          <UserPlus className="h-4 w-4" />
          Créer le compte
        </Button>
        {message && <p className="text-sm font-bold text-dtsc-blue">{message}</p>}
      </div>
    </form>
  );
}
