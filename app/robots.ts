import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { getCurrentHostType, getDocsBaseUrl, getPublicBaseUrl } from "@/lib/domains";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const requestHeaders = await headers();
  const hostType = getCurrentHostType(requestHeaders.get("host"));
  const publicBaseUrl = getPublicBaseUrl() || "https://dtsc-platform.com";

  if (hostType === "docs") {
    const docsBaseUrl = getDocsBaseUrl() || "https://docs.dtsc-platform.com";
    return {
      rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/dashboard", "/auth/"] }],
      sitemap: new URL("/sitemap.xml", docsBaseUrl).toString(),
      host: docsBaseUrl,
    };
  }

  if (hostType !== "public" && hostType !== "local" && hostType !== "unknown") {
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/services", "/solutions", "/secteurs", "/projets", "/ressources", "/ressources/", "/a-propos", "/contact", "/data-afrique", "/bi-kpi", "/ia-entreprise", "/conditions-utilisation", "/politique-confidentialite", "/politique-cookies"],
        disallow: ["/admin", "/dashboard", "/chat", "/support", "/notifications", "/announcements", "/profile", "/settings", "/api"],
      },
    ],
    sitemap: new URL("/sitemap.xml", publicBaseUrl).toString(),
    host: publicBaseUrl,
  };
}
