import type { Metadata } from "next";
import { InfoPage } from "@/components/public/info-page";
import { publicPages } from "@/lib/public-content";

export const metadata: Metadata = {
  title: "Secteurs accompagnés",
  description: "Assurances, cliniques, pharmacies, PME et organisations accompagnées par DTSC en data, BI, IA et transformation digitale.",
  alternates: { canonical: "/secteurs" },
};

export default function SecteursPage() {
  return <InfoPage {...publicPages.sectors} />;
}
