import type { Metadata } from "next";
import { InfoPage } from "@/components/public/info-page";
import { publicPages } from "@/lib/public-content";

export const metadata: Metadata = {
  title: "IA en entreprise — cas d'usage utiles, prudents et mesurables",
  description: "Comprendre l'IA utile en entreprise: chatbot, assistant documentaire, automatisation intelligente, validation humaine, sécurité et premiers cas d'usage.",
  alternates: { canonical: "/ia-entreprise" },
};

export default function IaEntreprisePage() {
  return <InfoPage {...publicPages.ai} />;
}
