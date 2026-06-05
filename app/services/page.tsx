import type { Metadata } from "next";
import { CorporatePage } from "@/components/public/corporate-page";
import { publicLongPages } from "@/lib/public-site";

export const metadata: Metadata = {
  title: "Services DTSC — 7 leviers numériques pour booster votre entreprise",
  description: "Découvrez les 7 leviers numériques DTSC: Data & BI, Intelligence artificielle, Solutions digitales, Audit & optimisation, Formations, Marketing digital et Imprimerie numérique.",
  alternates: { canonical: "/services" },
};

export default function ServicesPage() {
  return <CorporatePage page={publicLongPages.services} />;
}
