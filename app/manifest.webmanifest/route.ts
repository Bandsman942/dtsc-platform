import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentHostType } from "@/lib/domains";
import { getProductDefinition } from "@/lib/product-registry";

export const dynamic = "force-dynamic";

export async function GET() {
  const requestHeaders = await headers();
  const product = getProductDefinition(getCurrentHostType(requestHeaders.get("host")));
  const startUrl =
    product.code === "APP" ? "/dashboard"
    : product.code === "SUPPORT" ? "/support"
    : product.code === "ACCOUNT" ? "/auth/sign-in"
    : product.code === "CONSOLE" ? "/admin"
    : "/";

  const manifest = {
    id: `${startUrl}?source=pwa`,
    name:
      product.code === "PUBLIC" ? "DTSC"
      : product.code === "APP" ? "DTSC Platform"
      : product.label.fr,
    short_name: product.code === "APP" ? "DTSC" : product.label.fr,
    description: product.description.fr,
    start_url: startUrl,
    scope: "/",
    display: product.pwa === "disabled" ? "browser" : "standalone",
    background_color: "#06111f",
    theme_color: product.accent,
    orientation: "any",
    lang: "fr",
    categories: ["business", "productivity", "technology"],
    icons: [
      { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Vary": "Host",
    },
  });
}
