"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import Image from "next/image";
import { Dialog } from "@/components/ui/dialog";

type OpenImage = { src: string; alt: string } | null;

export function PublicArticleContent({ html }: { html: string }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<OpenImage>(null);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    for (const element of root.querySelectorAll("img")) {
      if (element.closest("a")) continue;
      element.tabIndex = 0;
      element.setAttribute("role", "button");
      element.setAttribute("aria-label", "Agrandir l’image : " + (element.alt || "illustration"));
    }
  }, [html]);

  function findZoomableImage(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return null;
    const candidate = target.closest("img");
    if (!(candidate instanceof HTMLImageElement)) return null;
    if (!contentRef.current?.contains(candidate) || candidate.closest("a")) return null;
    return candidate;
  }

  function openImage(target: EventTarget | null) {
    const img = findZoomableImage(target);
    if (!img) return;
    setImage({ src: img.currentSrc || img.src, alt: img.alt || "Illustration de l’article" });
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (findZoomableImage(event.target)) openImage(event.target);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (!findZoomableImage(event.target)) return;
    event.preventDefault();
    openImage(event.target);
  }

  return (
    <>
      <div
        ref={contentRef}
        className="dtsc-publication-content text-dtsc-muted"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <Dialog
        open={Boolean(image)}
        onClose={() => setImage(null)}
        title={image?.alt || "Agrandir l’image"}
        className="sm:max-w-[min(95vw,90rem)]"
      >
        {image ? (
          <div className="flex min-h-0 items-center justify-center bg-dtsc-page">
            <Image src={image.src} alt={image.alt} width={1600} height={1200} unoptimized
              className="max-h-[75dvh] w-auto max-w-full object-contain" />
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
