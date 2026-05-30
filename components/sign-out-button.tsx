"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getPublicUrl } from "@/lib/domains";

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    await fetch("/api/auth/sign-out", { method: "POST" });
    const target = getPublicUrl("/");
    if (/^https?:\/\//i.test(target)) {
      window.location.href = target;
      return;
    }
    router.push(target);
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={signOut}
      className="text-slate-500 hover:bg-slate-100 hover:text-[#001736]"
      aria-label="Déconnexion"
    >
      <LogOut className="h-4 w-4" />
    </Button>
  );
}
