import type { MetadataRoute } from "next";

const appUrl = process.env.APP_URL || "https://dtsc-platform.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/services", "/solutions", "/secteurs", "/projets", "/ressources", "/ressources/", "/a-propos", "/contact", "/data-afrique", "/bi-kpi", "/ia-entreprise", "/conditions-utilisation", "/politique-confidentialite", "/politique-cookies"],
        disallow: ["/admin", "/dashboard", "/chat", "/support", "/notifications", "/announcements", "/profile", "/settings", "/api"],
      },
    ],
    sitemap: new URL("/sitemap.xml", appUrl).toString(),
  };
}
