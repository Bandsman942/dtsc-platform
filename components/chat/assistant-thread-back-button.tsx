"use client";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/** On mobile this returns to the thread list, never to an unrelated browser page.
 * On desktop both the thread list and active chat remain visible.
 */
export function AssistantThreadBackButton({
  onBack,
  locale,
}: {
  onBack: () => void;
  locale: string;
}) {
  const label = locale === "en" ? "Back to conversations" : "Retour aux conversations";
  return (
    <Button type="button" variant="ghost" size="icon" title={label}
      aria-label={label} onClick={onBack}
      className="min-h-11 min-w-11 shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 lg:hidden">
      <ArrowLeft className="h-5 w-5" aria-hidden="true" />
    </Button>
  );
}
