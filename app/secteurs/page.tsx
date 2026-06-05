import type { Metadata } from "next";
import { CorporatePage } from "@/components/public/corporate-page";
import { publicLongPages } from "@/lib/public-site";

export const metadata: Metadata = {
  title: "Secteurs DTSC — santé, assurances, PME, ONG, éducation, finance et administration",
  description: "Secteurs accompagnés par DTSC avec les 7 leviers numériques adaptés aux douleurs, solutions possibles, premiers projets et résultats attendus.",
  alternates: { canonical: "/secteurs" },
};

export default function SecteursPage() {
  return <CorporatePage page={publicLongPages.secteurs} />;
}
