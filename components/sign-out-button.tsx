"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    await fetch("/api/auth/sign-out", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={signOut}
      className="text-slate-300 hover:bg-white/10 hover:text-white"
      aria-label="Déconnexion"
    >
      <LogOut className="h-4 w-4" />
    </Button>
  );
}
