import type { Metadata } from "next";
import { InfoPage } from "@/components/public/info-page";
import { publicPages } from "@/lib/public-content";

export const metadata: Metadata = {
  title: "IA en entreprise",
  description: "Intelligence artificielle responsable, chatbots professionnels, automatisation et cas d'usage IA pour les entreprises.",
  alternates: { canonical: "/ia-entreprise" },
};

export default function IaEntreprisePage() {
  return <InfoPage {...publicPages.ai} />;
}
