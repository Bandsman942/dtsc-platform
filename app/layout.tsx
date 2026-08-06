import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { PWARegister } from "@/components/pwa/pwa-register";
import { ProductScopedProfessionalToolbox } from "@/components/productivity/product-scoped-professional-toolbox";
import { FloatingActionHubProvider } from "@/components/floating-actions/floating-action-hub";
import { ToastProvider } from "@/components/ui/toast-provider";
import { dtsc } from "@/lib/dtsc";
import { getCurrentHostType } from "@/lib/domains";
import { getProductBaseUrl, getProductDefinition } from "@/lib/product-registry";
import "./globals.css";
import "./design-system.css";
import "./mobile-stability.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

function getRequestedLocale(cookieLocale: string | undefined, acceptLanguage: string | null) {
  if (cookieLocale === "en" || cookieLocale === "fr") return cookieLocale;
  return acceptLanguage?.toLowerCase().startsWith("en") ? "en" : "fr";
}

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const hostType = getCurrentHostType(requestHeaders.get("host"));
  const product = getProductDefinition(hostType);
  const baseUrl = getProductBaseUrl(hostType);
  const isPublic = product.code === "PUBLIC";
  const title = isPublic ? "DTSC | 7 leviers numériques de performance" : `${product.label.fr} | DTSC`;
  const description = isPublic ? "DTSC aide les organisations à améliorer leur performance grâce à sept leviers numériques complémentaires." : product.description.fr;
  return {
    metadataBase: new URL(baseUrl),
    applicationName: product.code === "APP" ? "DTSC Platform" : product.label.fr,
    manifest: product.pwa === "disabled" ? undefined : "/manifest.webmanifest",
    title: { default: title, template: `%s | ${product.label.fr}` },
    description,
    keywords: isPublic ? ["DTSC", "Data & BI", "intelligence artificielle", "solutions digitales", "audit", "formations", "marketing digital", "imprimerie numérique", "Kinshasa", "RDC", "Afrique"] : undefined,
    authors: isPublic ? [{ name: dtsc.fullName, url: baseUrl }] : undefined,
    creator: dtsc.fullName,
    publisher: dtsc.fullName,
    alternates: isPublic ? { canonical: "/" } : undefined,
    openGraph: isPublic ? { type: "website", locale: "fr_CD", url: baseUrl, siteName: "DTSC", title, description, images: [{ url: "/dtsc-logo.png", width: 1536, height: 864, alt: "Logo DTSC" }] } : undefined,
    twitter: isPublic ? { card: "summary_large_image", title, description, images: ["/dtsc-logo.png"] } : undefined,
    robots: isPublic ? { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } } : { index: false, follow: false, nocache: true },
    icons: { icon: [{ url: "/favicon.ico" }, { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" }, { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" }], apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }] },
    appleWebApp: product.pwa === "disabled" ? undefined : { capable: true, title: product.label.fr, statusBarStyle: "black-translucent" },
  };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f6f8fb" }, { media: "(prefers-color-scheme: dark)", color: "#06111f" }] };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [requestHeaders, cookieStore] = await Promise.all([headers(), cookies()]);
  const hostType = getCurrentHostType(requestHeaders.get("host"));
  const product = getProductDefinition(hostType);
  const locale = getRequestedLocale(cookieStore.get("dtsc_locale")?.value || cookieStore.get("NEXT_LOCALE")?.value, requestHeaders.get("accept-language"));
  const isPublic = product.code === "PUBLIC";
  const publicUrl = getProductBaseUrl("public");
  return (
    <html lang={locale} className={`${geistSans.variable} ${geistMono.variable}`} data-dtsc-product={product.code.toLowerCase()} suppressHydrationWarning>
      <body data-dtsc-responsive-root className="min-w-0 max-w-full overflow-x-clip antialiased">
        {isPublic ? <script type="application/ld+json" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": ["Organization", "ProfessionalService"], name: dtsc.fullName, alternateName: dtsc.name, slogan: dtsc.slogan, url: publicUrl, email: dtsc.email, telephone: dtsc.whatsapp, areaServed: ["RDC", "Afrique"], address: { "@type": "PostalAddress", addressLocality: "Kinshasa", addressCountry: "CD" }, sameAs: ["https://www.facebook.com/dtsc-platform", "https://www.instagram.com/dtsc.platform", "https://x.com/dtscplatform"], serviceType: dtsc.services }) }} /> : null}
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <PWARegister enabled={product.pwa !== "disabled"} />
          <ToastProvider />
          <FloatingActionHubProvider>
            {children}
            <ProductScopedProfessionalToolbox />
          </FloatingActionHubProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
