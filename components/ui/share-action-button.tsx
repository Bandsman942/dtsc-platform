"use client";

import { useState } from "react";
import type { ComponentProps } from "react";
import { Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ShareActionButton({
  title,
  text,
  url,
  label = "Partager",
  className,
  variant = "outline",
  size,
}: {
  title: string;
  text?: string;
  url: string;
  label?: string;
  className?: string;
  variant?: ComponentProps<typeof Button>["variant"];
  size?: ComponentProps<typeof Button>["size"];
}) {
  const [copied, setCopied] = useState(false);
  const iconOnly = size === "icon";

  async function share() {
    const absoluteUrl = url.startsWith("http") ? url : `${window.location.origin}${url}`;
    if (navigator.share) {
      await navigator.share({ title, text, url: absoluteUrl }).catch(() => undefined);
      return;
    }

    await navigator.clipboard.writeText(absoluteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  }

  return (
    <Button type="button" variant={variant} size={size} onClick={share} className={cn("rounded-xl", className)}>
      {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
      {!iconOnly && (copied ? "Lien copié" : label)}
    </Button>
  );
}
