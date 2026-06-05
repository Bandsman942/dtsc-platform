import type { Metadata } from "next";
import { CorporatePage } from "@/components/public/corporate-page";
import { publicLongPages } from "@/lib/public-site";

export const metadata: Metadata = {
  title: "Solutions DTSC — cas d'usage IA, Data & BI et Solutions digitales",
  description: "Solutions DTSC présentées comme cas d'application des 7 leviers: chatbot, dashboard, application web, assistant documentaire, workflow, marketing et supports imprimés.",
  alternates: { canonical: "/solutions" },
};

export default function SolutionsPage() {
  return <CorporatePage page={publicLongPages.solutions} />;
}
