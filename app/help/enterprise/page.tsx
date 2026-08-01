import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { requireUser } from "@/lib/auth";

const GUIDES: Record<string, { title: string; steps: string[]; limits: string[] }> = {
  CRM_CUSTOMERS: { title: "Tiers, prospects et clients", steps: ["Choisissez Personne ou Organisation.", "Renseignez les rôles, coordonnées et adresses utiles.", "Comparez les doublons proposés avant de confirmer.", "Invitez éventuellement la personne à relier son compte DTSC."], limits: ["Aucune fusion automatique.", "Une fiche reste utilisable sans compte DTSC."] },
  CATALOG: { title: "Catalogue produits et services", steps: ["Créez une catégorie.", "Définissez une unité de mesure.", "Ajoutez un produit ou service.", "Renseignez prix, devise et fiscalité."], limits: ["Les lots et données sectorielles restent dans leurs modules spécialisés."] },
  SITES_WAREHOUSES: { title: "Sites, entrepôts et emplacements", steps: ["Créez un site.", "Rattachez un entrepôt au site.", "Ajoutez zones et emplacements.", "Utilisez la vue hiérarchique pour vérifier la structure."], limits: ["Les références d’une autre entreprise sont refusées."] },
  CRM_PIPELINE: { title: "CRM et pipeline", steps: ["Ajoutez un prospect.", "Affectez un responsable et une prochaine action.", "Faites progresser l’opportunité avec les actions d’étape.", "Lors de la conversion, choisissez une fiche existante ou confirmez une nouvelle fiche."], limits: ["Le glisser-déposer n’est jamais l’unique moyen de changer d’étape."] },
  CONTRACTS: { title: "Contrats", steps: ["Sélectionnez le client ou partenaire.", "Renseignez période, valeur, renouvellement et responsable.", "Soumettez le contrat à validation.", "Activez, suspendez, renouvelez ou résiliez selon le statut."], limits: ["Le statut ne se modifie jamais directement depuis le navigateur."] },
  HUMAN_RESOURCES: { title: "Employés et collaborateurs", steps: ["Créez le dossier RH.", "Choisissez le poste et le département.", "Invitez éventuellement le collaborateur à relier son compte.", "Révoquez la liaison sans supprimer le dossier si nécessaire."], limits: ["Les rémunérations, documents RH et performances ne sont jamais synchronisés vers le compte global."] },
};

export default async function EnterpriseHelpPage({ searchParams }: { searchParams: Promise<{ module?: string }> }) {
  const user = await requireUser();
  const { module } = await searchParams;
  const code = (module || "CRM_CUSTOMERS").toUpperCase();
  const guide = GUIDES[code] || GUIDES.CRM_CUSTOMERS;
  return <AppShell user={user}><ModuleWorkspace><ModuleHeader eyebrow="Centre d’aide ERP" title={guide.title} description="Guide de prise en main, limites connues et accès au support humain." /><ModuleContent><ModuleSection title="Première configuration"><ol className="grid gap-3 text-sm text-dtsc-ink">{guide.steps.map((step, index) => <li key={step} className="border-y border-dtsc-border py-3"><strong>{index + 1}.</strong> {step}</li>)}</ol></ModuleSection><ModuleSection title="Limites et sécurité"><ul className="grid gap-2 text-sm text-dtsc-muted">{guide.limits.map((limit) => <li key={limit}>• {limit}</li>)}</ul></ModuleSection><ModuleSection title="Besoin d’accompagnement"><div className="flex flex-wrap gap-3"><Link href="/support" className="min-h-11 rounded-xl bg-dtsc-blue px-4 py-3 text-sm font-black text-white">Contacter le support DTSC</Link><Link href="/enterprise-admin" className="min-h-11 rounded-xl border border-dtsc-border px-4 py-3 text-sm font-black text-dtsc-ink">Vérifier la configuration</Link></div></ModuleSection></ModuleContent></ModuleWorkspace></AppShell>;
}
