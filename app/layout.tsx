import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { PWARegister } from "@/components/pwa/pwa-register";
import { dtsc } from "@/lib/dtsc";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const appUrl = process.env.APP_URL || "https://dtsc-platform.com";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  applicationName: "DTSC Platform",
  manifest: "/manifest.webmanifest",
  title: {
    default: "DTSC Platform | Data, IA et transformation digitale",
    template: "%s | DTSC Platform",
  },
  description:
    "DTSC accompagne les entreprises en transformation digitale, data, BI, dashboards KPI, intelligence artificielle, automatisation, marketing digital et applications métier.",
  keywords: [
    "DTSC",
    "Data and Tech Solutions Consulting",
    "transformation digitale",
    "data consulting",
    "business intelligence",
    "Power BI",
    "dashboards KPI",
    "intelligence artificielle",
    "chatbot professionnel",
    "automatisation des processus",
    "Kinshasa",
    "RDC",
    "Afrique",
  ],
  authors: [{ name: dtsc.fullName, url: appUrl }],
  creator: dtsc.fullName,
  publisher: dtsc.fullName,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "fr_CD",
    url: appUrl,
    siteName: "DTSC Platform",
    title: "DTSC Platform | Data, IA et transformation digitale",
    description:
      "Cabinet DTSC basé à Kinshasa: conseil numérique, data, BI, IA, automatisation, dashboards et chatbot professionnel.",
    images: [
      {
        url: "/dtsc-logo.png",
        width: 1536,
        height: 864,
        alt: "Logo DTSC - Data and Tech Solutions Consulting",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "DTSC Platform | Data, IA et transformation digitale",
    description:
      "Le numérique au service de votre performance: data, BI, IA, automatisation et applications métier pour les entreprises.",
    images: ["/dtsc-logo.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "DTSC",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B1220",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body
        className="antialiased"
      >
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "ProfessionalService",
              name: dtsc.fullName,
              alternateName: dtsc.name,
              slogan: dtsc.slogan,
              url: appUrl,
              email: dtsc.email,
              telephone: dtsc.whatsapp,
              areaServed: ["RDC", "Afrique"],
              address: {
                "@type": "PostalAddress",
                addressLocality: "Kinshasa",
                addressCountry: "CD",
              },
              sameAs: [
                "https://www.facebook.com/dtsc-platform",
                "https://www.instagram.com/dtsc.platform",
                "https://x.com/dtscplatform",
              ],
              serviceType: dtsc.services,
            }),
          }}
        />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <PWARegister />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
