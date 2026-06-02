import type { Metadata } from "next";
import { InfoPage } from "@/components/public/info-page";
import { publicPages } from "@/lib/public-content";

export const metadata: Metadata = {
  title: "IA en entreprise",
  description: "Levier Intelligence artificielle DTSC: chatbots, assistants documentaires, modèles prédictifs et automatisation intelligente comme cas d'usage.",
  alternates: { canonical: "/ia-entreprise" },
};

export default function IaEntreprisePage() {
  return <InfoPage {...publicPages.ai} />;
}
