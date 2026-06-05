import type { Metadata } from "next";
import { CorporatePage } from "@/components/public/corporate-page";
import { publicLongPages } from "@/lib/public-site";

export const metadata: Metadata = {
  title: "Projets DTSC — démonstrations et projets numériques prêts à cadrer",
  description: "Projets types DTSC rattachés aux 7 leviers numériques: dashboard exécutif, chatbot IA, clinique digitalisée, reporting ONG, audit, formation et supports commerciaux.",
  alternates: { canonical: "/projets" },
};

export default function ProjetsPage() {
  return <CorporatePage page={publicLongPages.projets} />;
}
