import type { Metadata } from "next";
import { CorporatePage } from "@/components/public/corporate-page";
import { publicLongPages } from "@/lib/public-site";

export const metadata: Metadata = {
  title: "Solutions DTSC",
  description: "Solutions DTSC: chatbot intelligent, dashboards Power BI, applications métier, automatisation, portails clients, CRM et IA documentaire.",
  alternates: { canonical: "/solutions" },
};

export default function SolutionsPage() {
  return <CorporatePage page={publicLongPages.solutions} />;
}
