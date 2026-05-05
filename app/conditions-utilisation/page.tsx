import { InfoPage } from "@/components/public/info-page";
import { legalPages, legalSources } from "@/lib/public-content";

export default function TermsPage() {
  return <InfoPage {...legalPages.terms} sourceList={legalSources} />;
}
