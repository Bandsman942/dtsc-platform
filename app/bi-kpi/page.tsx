import type { Metadata } from "next";
import { InfoPage } from "@/components/public/info-page";
import { publicPages } from "@/lib/public-content";

export const metadata: Metadata = {
  title: "BI, KPI et reporting",
  description: "Levier Data & BI DTSC: tableaux de bord, KPI, reporting et pilotage de la performance pour les entreprises.",
  alternates: { canonical: "/bi-kpi" },
};

export default function BiKpiPage() {
  return <InfoPage {...publicPages.bi} />;
}
