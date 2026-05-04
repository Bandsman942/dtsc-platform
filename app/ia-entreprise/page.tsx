import { InfoPage } from "@/components/public/info-page";
import { publicPages } from "@/lib/public-content";

export default function IaEntreprisePage() {
  return <InfoPage {...publicPages.ai} />;
}
