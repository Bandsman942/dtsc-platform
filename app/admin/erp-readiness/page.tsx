import { redirect } from "next/navigation";

// Legacy contract: the canonical /admin/module-maturity page calls listCommercialMaturityCards.
export default function LegacyCommercialReadinessPage() {
  redirect("/admin/module-maturity");
}
