"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getSignInUrl } from "@/lib/domains";
import { getCurrentPushSubscription } from "@/lib/push/client";
import { broadcastBrowserSessionLogout } from "@/lib/session-client";

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    const subscription = await getCurrentPushSubscription().catch(() => null);
    const response = await fetch("/api/auth/sign-out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "manual", pushEndpoint: subscription?.endpoint || "" }),
    });
    if (response.ok && subscription) {
      await subscription.unsubscribe().catch(() => false);
    }
    broadcastBrowserSessionLogout();
    const body = (await response.json().catch(() => null)) as { redirectTo?: string } | null;
    const target = body?.redirectTo || getSignInUrl();
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
