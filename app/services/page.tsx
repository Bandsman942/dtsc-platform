import type { Metadata } from "next";
import { CorporatePage } from "@/components/public/corporate-page";
import { publicLongPages } from "@/lib/public-site";

export const metadata: Metadata = {
  title: "Services DTSC",
  description: "Services DTSC structurés autour de 7 leviers numériques: Data & BI, Intelligence artificielle, Solutions digitales, Audit & optimisation, Formations, Marketing digital et Imprimerie numérique.",
  alternates: { canonical: "/services" },
};

export default function ServicesPage() {
  return <CorporatePage page={publicLongPages.services} />;
}
