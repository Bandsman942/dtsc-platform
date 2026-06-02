import type { Metadata } from "next";
import { CorporatePage } from "@/components/public/corporate-page";
import { publicLongPages } from "@/lib/public-site";

export const metadata: Metadata = {
  title: "Projets et démonstrations DTSC",
  description: "Projets et démonstrations DTSC présentés comme des cas d'application des 7 leviers numériques officiels.",
  alternates: { canonical: "/projets" },
};

export default function ProjetsPage() {
  return <CorporatePage page={publicLongPages.projets} />;
}
