"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Dialog } from "@/components/ui/dialog";

type OpenImage = { src: string; alt: string } | null;

export function PublicArticleContent({ html }: { html: string }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<OpenImage>(null);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const listeners: Array<{ button: HTMLButtonElement; handler: () => void }> = [];
    for (const element of root.querySelectorAll("img")) {
      if (element.closest("a,button")) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.dtscArticleZoom = "true";
      button.className = "inline-flex max-w-full items-center justify-center rounded-xl focus-visible:outline-2 focus-visible:outline-dtsc-blue";
      button.setAttribute("aria-label", "Agrandir l’image : " + (element.alt || "illustration"));
      const handler = () => setImage({
        src: element.currentSrc || element.src,
        alt: element.alt || "Illustration de l’article",
      });
      button.addEventListener("click", handler);
      listeners.push({ button, handler });
      element.replaceWith(button);
      button.appendChild(element);
    }
    return () => {
      for (const { button, handler } of listeners) button.removeEventListener("click", handler);
    };
  }, [html]);

  return (
    <>
      <div
        ref={contentRef}
        className="dtsc-publication-content text-dtsc-muted"
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
