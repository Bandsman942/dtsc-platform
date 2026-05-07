import type { Metadata } from "next";
import { CorporatePage } from "@/components/public/corporate-page";
import { publicLongPages } from "@/lib/public-site";

export const metadata: Metadata = {
  title: "Secteurs accompagnés",
  description: "Assurances, cliniques, pharmacies, PME et organisations accompagnées par DTSC en data, BI, IA et transformation digitale.",
  alternates: { canonical: "/secteurs" },
};

export default function SecteursPage() {
  return <CorporatePage page={publicLongPages.secteurs} />;
}
