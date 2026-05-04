import { InfoPage } from "@/components/public/info-page";
import { publicPages } from "@/lib/public-content";

export default function SecteursPage() {
  return <InfoPage {...publicPages.sectors} />;
}
