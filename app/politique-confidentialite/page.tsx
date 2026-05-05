import { InfoPage } from "@/components/public/info-page";
import { legalPages, legalSources } from "@/lib/public-content";

export default function PrivacyPage() {
  return <InfoPage {...legalPages.privacy} sourceList={legalSources} />;
}
