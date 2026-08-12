"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Minus, Plus, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

type ActiveImage = { src: string; alt: string };

export function AnnouncementMediaEnhancer() {
  const [activeImage, setActiveImage] = useState<ActiveImage | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-announcement-media-root]");
    if (!root) return;

    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof HTMLImageElement) || !target.closest(".dtsc-feed-content")) return;
      event.preventDefault();
      setZoom(1);
      setActiveImage({ src: target.currentSrc || target.src, alt: target.alt || "Image de l’annonce" });
    }

    root.addEventListener("click", handleClick);
    return () => root.removeEventListener("click", handleClick);
  }, []);

  useEffect(() => {
    if (!activeImage) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setActiveImage(null);
      if (event.key === "+" || event.key === "=") setZoom((current) => Math.min(MAX_ZOOM, current + ZOOM_STEP));
      if (event.key === "-") setZoom((current) => Math.max(MIN_ZOOM, current - ZOOM_STEP));
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeImage]);

  if (!activeImage || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1400] flex min-w-0 flex-col bg-[#020711]/96 text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Aperçu de l’image"
      onClick={(event) => {
        if (event.target === event.currentTarget) setActiveImage(null);
      }}
    >
      <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-white/10 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5">
        <p className="min-w-0 truncate text-sm font-bold text-slate-200">{activeImage.alt}</p>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="ghost" size="icon" aria-label="Réduire" onClick={() => setZoom((current) => Math.max(MIN_ZOOM, current - ZOOM_STEP))} className="text-white hover:bg-white/10 hover:text-white">
            <Minus className="h-4 w-4" />
          </Button>
          <span className="min-w-12 text-center text-xs font-black text-slate-300">{Math.round(zoom * 100)}%</span>
          <Button type="button" variant="ghost" size="icon" aria-label="Agrandir" onClick={() => setZoom((current) => Math.min(MAX_ZOOM, current + ZOOM_STEP))} className="text-white hover:bg-white/10 hover:text-white">
            <Plus className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Réinitialiser le zoom" onClick={() => setZoom(1)} className="text-white hover:bg-white/10 hover:text-white">
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Fermer" onClick={() => setActiveImage(null)} className="text-white hover:bg-white/10 hover:text-white">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 touch-pan-x touch-pan-y overflow-auto overscroll-contain p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-5">
        <div className="flex min-h-full min-w-full items-center justify-center">
          {/* Native image is intentional: the zoom viewer reuses arbitrary rich-content currentSrc values. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={activeImage.src}
            alt={activeImage.alt}
            draggable={false}
            className="h-auto max-h-[calc(100dvh-5rem)] max-w-full select-none object-contain [image-rendering:auto]"
            style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}