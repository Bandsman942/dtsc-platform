import type { Metadata } from "next";
import { CorporatePage } from "@/components/public/corporate-page";
import { publicLongPages } from "@/lib/public-site";

export const metadata: Metadata = {
  title: "Secteurs accompagnés",
  description: "Secteurs accompagnés par DTSC avec les 7 leviers numériques adaptés aux réalités métier: assurances, santé, PME, ONG, finance, éducation et administration.",
  alternates: { canonical: "/secteurs" },
};

export default function SecteursPage() {
  return <CorporatePage page={publicLongPages.secteurs} />;
}
