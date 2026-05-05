import type { Metadata } from "next";
import { InfoPage } from "@/components/public/info-page";
import { publicPages } from "@/lib/public-content";

export const metadata: Metadata = {
  title: "BI, KPI et reporting",
  description: "Tableaux de bord, KPI, reporting automatisé et pilotage de la performance pour les entreprises accompagnées par DTSC.",
  alternates: { canonical: "/bi-kpi" },
};

export default function BiKpiPage() {
  return <InfoPage {...publicPages.bi} />;
}
