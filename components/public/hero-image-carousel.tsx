"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export function HeroImageCarousel({
  images,
  label,
  eyebrow,
  priority = false,
  className,
}: {
  images: string[];
  label: string;
  eyebrow: string;
  priority?: boolean;
  className?: string;
}) {
  const slides = useMemo(() => images.filter(Boolean), [images]);
  const [activeIndex, setActiveIndex] = useState(0);

  const showNext = useCallback(() => {
    setActiveIndex((current) => (current + 1) % slides.length);
  }, [slides.length]);

  const showPrevious = useCallback(() => {
    setActiveIndex((current) => (current - 1 + slides.length) % slides.length);
  }, [slides.length]);

  useEffect(() => {
    if (slides.length <= 1) {
      return;
    }

    const interval = window.setInterval(showNext, 4500);

    return () => window.clearInterval(interval);
  }, [showNext, slides.length]);

  const activeImage = slides[activeIndex] || images[0];

  return (
    <div className={cn("relative h-72 w-full min-w-0 max-w-full overflow-hidden", className)}>
      {activeImage && (
        <Image
          key={activeImage}
          src={activeImage}
          alt={label}
          fill
          className="animate-hero-image object-cover opacity-90"
          sizes="(max-width: 1024px) 100vw, 45vw"
          priority={priority}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-[#001736] via-[#001736]/35 to-transparent" />
      {slides.length > 1 && (
        <button
          type="button"
          onClick={showNext}
          className="absolute inset-0 z-10 cursor-pointer"
          aria-label="Afficher l'image suivante"
        />
      )}
      <div className="absolute bottom-5 left-5 right-5 z-20 min-w-0">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">{eyebrow}</p>
        <h2 className="mt-2 break-words text-2xl font-black">{label}</h2>
      </div>
      {slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={showPrevious}
            className="absolute left-4 top-1/2 z-30 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/25 bg-[#001736]/75 text-white shadow-2xl shadow-cyan-950/30 backdrop-blur transition hover:border-cyan-200 hover:bg-cyan-400 hover:text-[#001736] focus:outline-none focus:ring-2 focus:ring-cyan-200"
            aria-label="Afficher l'image précédente"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={showNext}
            className="absolute right-4 top-1/2 z-30 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/25 bg-[#001736]/75 text-white shadow-2xl shadow-cyan-950/30 backdrop-blur transition hover:border-cyan-200 hover:bg-cyan-400 hover:text-[#001736] focus:outline-none focus:ring-2 focus:ring-cyan-200"
            aria-label="Afficher l'image suivante"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="absolute right-5 top-5 z-30 flex gap-2">
            {slides.map((slide, index) => (
              <button
                key={slide}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={cn(
                  "h-2.5 rounded-full border border-white/40 transition-all",
                  index === activeIndex ? "w-8 bg-cyan-300" : "w-2.5 bg-white/40 hover:bg-white/70"
                )}
                aria-label={`Afficher l'image ${index + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
