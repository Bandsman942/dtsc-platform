"use client";

import { Copy, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import type { PromotionalBannerForClient, PromotionalBannerSurface } from "@/lib/promotional-banner-shared";

function surfaceFromPath(pathname: string | null): PromotionalBannerSurface | null {
  if (!pathname) return null;
  if (pathname === "/chat" || pathname.startsWith("/chat/")) return "CHATBOT";
  if (pathname === "/collaborators" || pathname.startsWith("/collaborators/")) return "COLLABORATORS";
  if (pathname === "/announcements" || pathname.startsWith("/announcements/")) return "ANNOUNCEMENTS";
  if (pathname === "/enterprise-modules/AI_ASSISTANT" || pathname.startsWith("/enterprise-modules/AI_ASSISTANT/")) return "ENTERPRISE_AI";
  return null;
}

export function PromotionalBannerHost({ banners }: { banners: PromotionalBannerForClient[] }) {
  const pathname = usePathname();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const surface = surfaceFromPath(pathname);
  const banner = useMemo(() => {
    if (!surface) return null;
    return banners.find((item) => item.surfaces.includes(surface) && !dismissedIds.has(item.id)) || null;
  }, [banners, dismissedIds, surface]);

  if (!banner) return null;
  const currentBanner = banner;

  async function dismissBanner() {
    const bannerId = currentBanner.id;
    setDismissedIds((current) => new Set([...current, bannerId]));
    await fetch(`/api/promotional-banners/${encodeURIComponent(bannerId)}/dismiss`, { method: "POST" }).catch(() => null);
  }

  return (
    <div className="pointer-events-none fixed left-1/2 top-[5.25rem] z-[70] w-[min(92vw,28rem)] -translate-x-1/2 lg:top-20">
      <section className="pointer-events-auto overflow-hidden rounded-2xl border border-white/10 bg-[#020617]/96 p-3 text-white shadow-[0_22px_70px_rgba(0,23,54,0.32)] ring-1 ring-cyan-300/10 backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 px-1 py-0.5">
            <p className="break-words font-mono text-[0.78rem] font-black leading-5 text-white">{currentBanner.title}</p>
            <p className="mt-1 break-words font-mono text-[0.74rem] font-semibold leading-5 text-cyan-50/90">{currentBanner.description}</p>
            {currentBanner.ctaUrl && currentBanner.ctaLabel ? (
              <a href={currentBanner.ctaUrl} className="mt-2 inline-flex rounded-full bg-cyan-300 px-3 py-1 text-xs font-black text-[#001736] transition hover:bg-white">
                {currentBanner.ctaLabel}
              </a>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <span title="Bannière DTSC" aria-label="Bannière DTSC" className="hidden h-8 w-8 items-center justify-center rounded-xl text-white/80 sm:flex">
              <Copy className="h-4 w-4" />
            </span>
            <button
              type="button"
              onClick={dismissBanner}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-white/80 transition hover:bg-white/10 hover:text-white"
              aria-label="Fermer la bannière"
              title="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
