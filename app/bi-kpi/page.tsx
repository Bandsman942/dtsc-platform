import type { Metadata } from "next";
import { InfoPage } from "@/components/public/info-page";
import { publicPages } from "@/lib/public-content";

export const metadata: Metadata = {
  title: "BI, KPI et reporting — tableaux de bord utiles avec DTSC",
  description: "Comprendre données, KPI, reporting et dashboards pour choisir des indicateurs fiables, éviter les erreurs fréquentes et former les équipes.",
  alternates: { canonical: "/bi-kpi" },
};

export default function BiKpiPage() {
  return <InfoPage {...publicPages.bi} />;
}
