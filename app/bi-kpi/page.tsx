import { InfoPage } from "@/components/public/info-page";
import { publicPages } from "@/lib/public-content";

export default function BiKpiPage() {
  return <InfoPage {...publicPages.bi} />;
}
