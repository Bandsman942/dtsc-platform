import type { Metadata } from "next";
import { CorporatePage } from "@/components/public/corporate-page";
import { publicLongPages } from "@/lib/public-site";
import { dtsc } from "@/lib/dtsc";

export const metadata: Metadata = {
  title: "À propos de DTSC — performance numérique mesurable depuis Kinshasa",
  description: "Découvrez la vision, l'origine, la méthode et l'organisation de DTSC autour des 7 leviers numériques pour les entreprises africaines.",
  alternates: { canonical: "/a-propos" },
};

export default function AProposPage() {
  return (
    <>
      <CorporatePage page={publicLongPages.about} />
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: dtsc.fullName,
            alternateName: dtsc.name,
            url: `https://${dtsc.website}`,
            email: dtsc.email,
            slogan: dtsc.slogan,
            address: dtsc.location,
          }),
        }}
      />
    </>
  );
}
