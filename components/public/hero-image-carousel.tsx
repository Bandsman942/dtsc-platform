"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
    if (slides.length <= 1) {
      return;
    }

    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slides.length);
    }, 4500);

    return () => window.clearInterval(interval);
  }, [slides.length]);

  const activeImage = slides[activeIndex] || images[0];

  return (
    <div className={cn("relative h-72 overflow-hidden", className)}>
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
      <div className="absolute bottom-5 left-5 right-5">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">{eyebrow}</p>
        <h2 className="mt-2 text-2xl font-black">{label}</h2>
      </div>
      {slides.length > 1 && (
        <div className="absolute right-5 top-5 flex gap-2">
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
      )}
    </div>
  );
}
