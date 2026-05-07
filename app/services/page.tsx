import type { Metadata } from "next";
import { CorporatePage } from "@/components/public/corporate-page";
import { publicLongPages } from "@/lib/public-site";

export const metadata: Metadata = {
  title: "Services DTSC",
  description: "Services DTSC: transformation numérique, data, BI, IA, automatisation, applications métier, marketing digital, formation et optimisation.",
  alternates: { canonical: "/services" },
};

export default function ServicesPage() {
  return <CorporatePage page={publicLongPages.services} />;
}
