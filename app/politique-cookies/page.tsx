import { InfoPage } from "@/components/public/info-page";
import { legalPages, legalSources } from "@/lib/public-content";

export default function CookiePolicyPage() {
  return <InfoPage {...legalPages.cookies} sourceList={legalSources} />;
}
