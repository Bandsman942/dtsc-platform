import type { Metadata } from "next";
import { CorporatePage } from "@/components/public/corporate-page";
import { publicLongPages } from "@/lib/public-site";
import { dtsc } from "@/lib/dtsc";

export const metadata: Metadata = {
  title: "À propos de DTSC",
  description: "Découvrez DTSC, cabinet basé à Kinshasa qui aide les organisations à booster leur performance avec 7 leviers numériques officiels.",
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
