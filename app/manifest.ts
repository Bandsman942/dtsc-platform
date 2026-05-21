import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DTSC Platform",
    short_name: "DTSC",
    description: "Plateforme professionnelle de services numériques, data, IA et consulting.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#0B1220",
    theme_color: "#0B1220",
    orientation: "any",
    lang: "fr",
    categories: ["business", "productivity", "technology"],
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/maskable-icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
