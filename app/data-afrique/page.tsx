import type { Metadata } from "next";
import { InfoPage } from "@/components/public/info-page";
import { publicPages } from "@/lib/public-content";

export const metadata: Metadata = {
  title: "Data en Afrique — structurer les données pour mieux décider",
  description: "Comprendre pourquoi la data devient stratégique en Afrique et comment DTSC relie Data & BI, audit et indicateurs pour PME, santé, assurances et ONG.",
  alternates: { canonical: "/data-afrique" },
};

export default function DataAfriquePage() {
  return <InfoPage {...publicPages.data} />;
}
