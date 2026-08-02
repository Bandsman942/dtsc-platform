import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { ModuleContent, ModuleHeader, ModuleSection, ModuleWorkspace } from "@/components/workspace/module-workspace";
import { requireUser } from "@/lib/auth";

type Guide = {
  title: string;
  purpose: string;
  prerequisites: string[];
  steps: string[];
  workflow: string[];
  controls: string[];
  troubleshooting: string[];
};

const GUIDES: Record<string, Guide> = {
  CRM_CUSTOMERS: {
    title: "Tiers, prospects et clients",
    purpose: "Constituer le référentiel unique des personnes et organisations utilisées par le CRM, les contrats, les ventes et les achats.",
    prerequisites: ["Disposer du droit d’écriture sur le module.", "Vérifier les coordonnées minimales et la nature Personne ou Organisation."],
    steps: ["Créez la fiche.", "Ajoutez les rôles métier utiles.", "Renseignez les contacts et adresses.", "Examinez les doublons proposés avant de confirmer."],
    workflow: ["Actif → Inactif → Archivé selon les actions disponibles.", "La liaison à un compte DTSC reste facultative et soumise au consentement."],
    controls: ["Aucune fusion automatique.", "Les données sont isolées par entreprise."],
    troubleshooting: ["Une personne n’apparaît pas dans un sélecteur : vérifiez que sa fiche et son rôle sont actifs."]
  },
  CATALOG: {
    title: "Catalogue produits et services",
    purpose: "Définir les articles et services réutilisables dans les devis, commandes, achats et mouvements de stock.",
    prerequisites: ["Créer les catégories et unités de mesure utiles."],
    steps: ["Créez une catégorie.", "Définissez une unité de mesure.", "Ajoutez un produit ou service.", "Renseignez prix, devise, fiscalité et statut."],
    workflow: ["Brouillon ou actif selon le formulaire, puis désactivation contrôlée."],
    controls: ["Les lots et données sectorielles restent dans leurs modules spécialisés."],
    troubleshooting: ["Article absent d’un devis : vérifiez son statut actif et son prix de vente."]
  },
  SITES_WAREHOUSES: {
    title: "Sites, entrepôts et emplacements",
    purpose: "Structurer les lieux utilisés par le stock, les actifs et les opérations logistiques.",
    prerequisites: ["Créer d’abord le site parent."],
    steps: ["Créez un site.", "Rattachez un entrepôt.", "Ajoutez zones et emplacements.", "Contrôlez la hiérarchie affichée."],
    workflow: ["Les références actives peuvent être utilisées par les opérations autorisées."],
    controls: ["Une référence appartenant à une autre entreprise est refusée."],
    troubleshooting: ["Emplacement absent : vérifiez son entrepôt parent et son statut."]
  },
  CRM_PIPELINE: {
    title: "CRM et pipeline",
    purpose: "Suivre les prospects, opportunités, responsables et prochaines actions jusqu’à la conversion.",
    prerequisites: ["Disposer d’un responsable et, pour une opportunité, d’un tiers actif."],
    steps: ["Ajoutez un prospect.", "Affectez un responsable et une prochaine action.", "Faites progresser l’opportunité.", "Convertissez explicitement vers une fiche ou opportunité."],
    workflow: ["Nouveau → Contacté → Qualifié → Proposition → Négociation → Gagné ou Perdu."],
    controls: ["Le glisser-déposer n’est jamais l’unique moyen de changer d’étape."],
    troubleshooting: ["Transition refusée : complétez le motif ou la prochaine action exigée par l’étape."]
  },
  CONTRACTS: {
    title: "Contrats commerciaux",
    purpose: "Créer, faire réviser, approuver, activer et suivre un contrat avec sa contrepartie, ses commentaires et ses documents.",
    prerequisites: ["Disposer d’une contrepartie active.", "Choisir un validateur différent du demandeur.", "Préparer les pièces contractuelles à téléverser dans Documents."],
    steps: ["Créez le contrat et sélectionnez la contrepartie.", "Renseignez période, montant, renouvellement, clauses et responsable.", "Choisissez le validateur puis soumettez.", "Le validateur approuve, refuse ou demande une correction.", "Ajoutez les commentaires et téléversez les versions signées depuis Documents."],
    workflow: ["Brouillon → En attente de validation → Approuvé → Actif.", "Une demande de correction renvoie le contrat en brouillon avec le motif conservé.", "Actif → Suspendu, Renouvelé, Résilié ou Archivé selon les règles."],
    controls: ["Seul le validateur assigné décide pendant la validation.", "Les commentaires sont modifiables ou supprimables uniquement par leur auteur.", "Le statut ne se modifie jamais directement dans le navigateur."],
    troubleshooting: ["Actions de validation absentes : vérifiez que vous êtes le validateur sélectionné et ouvrez le lien de notification.", "Document absent : ouvrez Documents liés puis utilisez Téléverser une version."]
  },
  SALES_QUOTES_ORDERS: {
    title: "Devis, commandes et livraisons",
    purpose: "Préparer un devis chiffré côté serveur, le faire accepter, le convertir en commande et enregistrer les livraisons.",
    prerequisites: ["Client actif, article ou service actif et prix configuré.", "Entrepôt requis pour une livraison de produit stocké."],
    steps: ["Touchez Nouveau devis.", "Choisissez le client, la devise et les lignes.", "Enregistrez puis envoyez le devis.", "Marquez la décision client.", "Convertissez une seule fois le devis accepté.", "Enregistrez les livraisons partielles ou complètes."],
    workflow: ["Devis : Brouillon → Envoyé → Accepté ou Refusé → Converti.", "Commande : Confirmée → Partiellement livrée → Livrée → Clôturée."],
    controls: ["Totaux et taxes sont recalculés côté serveur.", "Une clé d’idempotence empêche les doubles livraisons."],
    troubleshooting: ["Bouton Nouveau devis absent : vérifiez votre droit d’écriture.", "Livraison impossible : contrôlez les quantités restantes et l’entrepôt."]
  },
  SUPPLIERS_PURCHASES: {
    title: "Fournisseurs, achats et réceptions",
    purpose: "Gérer les fournisseurs, demandes d’achat, commandes, réceptions et écarts sans créer de dette financière automatique.",
    prerequisites: ["Fournisseur actif, catalogue et entrepôts configurés."],
    steps: ["Créez ou sélectionnez le fournisseur.", "Saisissez la demande ou commande d’achat.", "Choisissez le validateur lorsque requis.", "Enregistrez la réception réelle.", "Traitez les écarts et rattachez les documents."],
    workflow: ["Brouillon → Soumis → Approuvé ou Retourné → Commandé → Partiellement reçu → Reçu."],
    controls: ["La réception met à jour le stock de façon idempotente.", "La facture fournisseur reste une étape financière distincte."],
    troubleshooting: ["Article absent : vérifiez le catalogue actif.", "Réception bloquée : la quantité ne peut dépasser le restant commandé."]
  },
  INVENTORY_LOGISTICS: {
    title: "Stock, transferts et inventaires",
    purpose: "Consulter les soldes, transférer des quantités, compter le stock et soumettre les ajustements à validation.",
    prerequisites: ["Catalogue, sites, entrepôts et emplacements actifs."],
    steps: ["Consultez Stock.", "Créez un transfert entre deux entrepôts distincts.", "Choisissez un approbateur indépendant.", "Créez une campagne d’inventaire et saisissez les quantités comptées.", "Soumettez les écarts ou ajustements."],
    workflow: ["Transfert : En attente → Validé → En transit → Clôturé.", "Inventaire : Ouvert → Comptage → Validation → Clôturé."],
    controls: ["Le stock négatif est bloqué.", "Tous les mouvements sont traçables et idempotents."],
    troubleshooting: ["Onglets invisibles : faites glisser horizontalement le rail.", "Ajustement refusé : vérifiez le motif, la quantité et l’approbateur."]
  },
  HUMAN_RESOURCES: {
    title: "Employés et collaborateurs",
    purpose: "Gérer les dossiers RH propres à l’entreprise cliente, les postes, départements et contrats d’emploi.",
    prerequisites: ["Postes et départements configurés selon l’organisation."],
    steps: ["Créez le dossier RH.", "Choisissez poste, département et responsable.", "Renseignez les dates et conditions d’emploi.", "Invitez éventuellement le collaborateur à relier son compte.", "Clôturez le dossier sans effacer l’historique lors d’un départ."],
    workflow: ["Pré-embauche → Actif → Suspendu ou Sorti selon les actions disponibles."],
    controls: ["La fiche RH et le compte DTSC restent distincts.", "Rémunération et documents RH sont confidentiels."],
    troubleshooting: ["Collaborateur absent d’un sélecteur : vérifiez le statut actif du dossier et de l’adhésion."]
  },
  TIME_ATTENDANCE: {
    title: "Congés, présence et feuilles de temps",
    purpose: "Soumettre les absences et temps réellement travaillés, puis les faire valider avant toute consommation par la paie ou les projets.",
    prerequisites: ["Employé actif et validateur différent du déclarant."],
    steps: ["Choisissez Demander un congé ou Déclarer du temps.", "Renseignez période, activité et projet éventuel.", "Sélectionnez le validateur.", "Soumettez.", "Le validateur approuve, refuse ou retourne pour correction."],
    workflow: ["Brouillon → Soumis → Approuvé, Refusé ou Retourné.", "Les périodes verrouillées ne sont plus modifiables."],
    controls: ["Disponibilité, absence, présence, temps approuvé et paie sont distincts.", "Les chevauchements sont contrôlés côté serveur."],
    troubleshooting: ["Temps rejeté : corrigez la période ou les chevauchements puis soumettez de nouveau."]
  },
  PAYROLL_OPERATIONS: {
    title: "Paie opérationnelle",
    purpose: "Préparer une paie à partir des dossiers RH et éléments approuvés, faire valider le cycle et publier les bulletins privés.",
    prerequisites: ["Employés actifs, rémunérations configurées, période et approbateur disponibles."],
    steps: ["Créez la période de paie.", "Contrôlez les salariés et éléments variables.", "Générez le brouillon.", "Soumettez au validateur indépendant.", "Publiez les bulletins après approbation.", "Enregistrez le paiement séparément si le processus financier l’autorise."],
    workflow: ["Brouillon → Calculé → Soumis → Approuvé → Verrouillé ou Annulé."],
    controls: ["Une paie approuvée n’est pas automatiquement payée.", "Les bulletins ne sont visibles que par les personnes autorisées."],
    troubleshooting: ["Soumission bloquée : ouvrez les contrôles de préparation pour voir les éléments manquants."]
  },
  PROJECTS_SERVICES: {
    title: "Projets, équipes, jalons et risques",
    purpose: "Planifier un projet, affecter une équipe, suivre jalons, risques, coûts et avancement.",
    prerequisites: ["Client ou sponsor, responsable et membres actifs selon le projet."],
    steps: ["Créez le projet.", "Définissez responsable, période et budget indicatif.", "Ajoutez les membres et rôles.", "Créez jalons et risques.", "Mettez à jour l’avancement avec des commentaires traçables."],
    workflow: ["Planifié → Actif → En pause → Terminé ou Annulé."],
    controls: ["Les coûts affichés ne créent pas automatiquement une écriture comptable."],
    troubleshooting: ["Membre absent : vérifiez l’adhésion active à l’entreprise."]
  },
  TIME_DELIVERABLES: {
    title: "Prestations et livrables",
    purpose: "Rattacher les temps et livrables au projet, les soumettre à revue et conserver l’acceptation ou les corrections demandées.",
    prerequisites: ["Projet actif et responsable de validation défini."],
    steps: ["Créez le livrable ou la prestation.", "Décrivez le résultat attendu et l’échéance.", "Rattachez les preuves ou documents.", "Soumettez au validateur.", "Approuvez, refusez ou demandez une correction."],
    workflow: ["Brouillon → Soumis → Approuvé, Refusé ou Retourné → Livré ou Clôturé."],
    controls: ["Le temps approuvé reste distinct de la facturation et de la paie."],
    troubleshooting: ["Validation impossible : ouvrez le détail et vérifiez que vous êtes l’approbateur assigné."]
  },
  ASSETS_MAINTENANCE: {
    title: "Actifs, affectations et maintenance",
    purpose: "Enregistrer les actifs professionnels, leur emplacement, leurs affectations, retours, incidents et opérations de maintenance.",
    prerequisites: ["Catégorie d’actif et site ou emplacement configurés."],
    steps: ["Créez l’actif.", "Renseignez catégorie, état, coût indicatif et emplacement.", "Affectez-le à un collaborateur avec une date.", "Enregistrez le retour ou l’incident.", "Planifiez et clôturez la maintenance."],
    workflow: ["Disponible → Affecté → En maintenance → Disponible, Retiré ou Perdu selon les actions autorisées."],
    controls: ["Créer un actif ne crée pas automatiquement une immobilisation comptable.", "Les affectations et retours restent historisés."],
    troubleshooting: ["Affectation impossible : l’actif doit être disponible et le collaborateur actif."]
  },
};

export default async function EnterpriseHelpPage({ searchParams }: { searchParams: Promise<{ module?: string }> }) {
  const user = await requireUser();
  const { module } = await searchParams;
  const code = (module || "").toUpperCase();
  const guide = GUIDES[code];

  return (
    <AppShell user={user}>
      <ModuleWorkspace>
        <ModuleHeader
          eyebrow="Centre d’aide ERP"
          title={guide?.title || "Guide du module indisponible"}
          description={guide?.purpose || `Aucun guide n’est encore publié pour le code ${code || "non précisé"}. Le système ne vous redirige plus silencieusement vers le guide d’un autre module.`}
        />
        <ModuleContent>
          {guide ? (
            <>
              <ModuleSection title="Avant de commencer"><ul className="grid gap-2 text-sm leading-6 text-dtsc-muted">{guide.prerequisites.map((item) => <li key={item}>• {item}</li>)}</ul></ModuleSection>
              <ModuleSection title="Procédure pas à pas"><ol className="grid gap-3 text-sm text-dtsc-ink">{guide.steps.map((step, index) => <li key={step} className="border-y border-dtsc-border py-3"><strong>{index + 1}.</strong> {step}</li>)}</ol></ModuleSection>
              <ModuleSection title="Statuts et workflow"><ul className="grid gap-2 text-sm leading-6 text-dtsc-muted">{guide.workflow.map((item) => <li key={item}>• {item}</li>)}</ul></ModuleSection>
              <ModuleSection title="Contrôles et confidentialité"><ul className="grid gap-2 text-sm leading-6 text-dtsc-muted">{guide.controls.map((item) => <li key={item}>• {item}</li>)}</ul></ModuleSection>
              <ModuleSection title="Dépannage"><ul className="grid gap-2 text-sm leading-6 text-dtsc-muted">{guide.troubleshooting.map((item) => <li key={item}>• {item}</li>)}</ul></ModuleSection>
            </>
          ) : null}
          <ModuleSection title="Besoin d’accompagnement"><div data-responsive-actions><Link href="/support" className="min-h-11 rounded-xl bg-dtsc-blue px-4 py-3 text-center text-sm font-black text-white">Contacter le support DTSC</Link><Link href="/enterprise-admin" className="min-h-11 rounded-xl border border-dtsc-border px-4 py-3 text-center text-sm font-black text-dtsc-ink">Vérifier la configuration</Link></div></ModuleSection>
        </ModuleContent>
      </ModuleWorkspace>
    </AppShell>
  );
}
