import type { Metadata } from "next";
import { CorporatePage } from "@/components/public/corporate-page";
import { publicLongPages } from "@/lib/public-site";

export const metadata: Metadata = {
  title: "Solutions DTSC",
  description: "Solutions DTSC présentées comme des cas d'application des 7 leviers numériques: IA, Data & BI, Solutions digitales, audit, formations, marketing et imprimerie.",
  alternates: { canonical: "/solutions" },
};

export default function SolutionsPage() {
  return <CorporatePage page={publicLongPages.solutions} />;
}
