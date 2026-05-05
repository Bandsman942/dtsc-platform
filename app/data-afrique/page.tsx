import type { Metadata } from "next";
import { InfoPage } from "@/components/public/info-page";
import { publicPages } from "@/lib/public-content";

export const metadata: Metadata = {
  title: "Data en Afrique",
  description: "Comprendre pourquoi la data devient stratégique pour les entreprises africaines et comment DTSC accompagne la structuration des données.",
  alternates: { canonical: "/data-afrique" },
};

export default function DataAfriquePage() {
  return <InfoPage {...publicPages.data} />;
}
