export type StandardGuideSlug =
  | "dashboard"
  | "billing"
  | "company"
  | "profile"
  | "settings"
  | "notifications"
  | "invitations"
  | "company-relationships";

export type StandardGuide = {
  slug: StandardGuideSlug;
  title: string;
  summary: string;
  sections: Array<{ title: string; steps: string[] }>;
};

export const STANDARD_PERSONAL_WORKSPACE_GUIDES: Record<StandardGuideSlug, StandardGuide> = {
  dashboard: {
    slug: "dashboard",
    title: "Guide du Dashboard personnel",
    summary: "Comprendre le contexte actif, les actions attendues, l’abonnement, les organisations et l’activité récente.",
    sections: [
      { title: "Contexte actif", steps: ["Vérifiez le badge de contexte en haut de page.", "Utilisez le sélecteur global pour passer du compte personnel à un espace autorisé.", "Une organisation révoquée disparaît automatiquement des choix disponibles."] },
      { title: "Actions attendues", steps: ["Traitez d’abord les éléments urgents puis importants.", "Chaque action ouvre l’invitation, la relation, la notification ou le ticket concerné.", "Les compteurs proviennent des sources autorisées du compte."] },
      { title: "Abonnement et limites", steps: ["Consultez le plan appliqué au contexte.", "Comparez l’utilisation réelle aux limites affichées.", "Ouvrez Abonnement pour voir les factures et le statut détaillé."] },
    ],
  },
  billing: {
    slug: "billing",
    title: "Guide de l’Abonnement",
    summary: "Lire le plan actif, le statut, les périodes, les limites, les paiements et les factures SaaS.",
    sections: [
      { title: "Plan et statut", steps: ["Distinguez l’abonnement personnel de l’abonnement de l’organisation active.", "Un statut en attente, en retard, annulé ou expiré peut limiter certaines capacités.", "Les fonctionnalités affichées sont alignées sur les entitlements serveur."] },
      { title: "Factures SaaS", steps: ["Les factures de ce module concernent le service DTSC, jamais la comptabilité ERP d’une entreprise.", "Ouvrez ou téléchargez uniquement les documents réellement disponibles.", "Les références, montants, devises et statuts viennent des données de facturation."] },
      { title: "Changement de plan", steps: ["Une action de changement n’est affichée que si le fournisseur de paiement est configuré.", "Vérifiez le récapitulatif avant toute confirmation.", "En cas d’échec fournisseur, conservez la référence et contactez le support."] },
    ],
  },
  company: {
    slug: "company",
    title: "Guide Entreprise du compte",
    summary: "Distinguer le profil professionnel déclaré, les organisations clientes, les memberships et les relations validées.",
    sections: [
      { title: "Profil déclaré", steps: ["Renseignez l’entreprise associée à votre propre profil professionnel.", "Ces informations n’accordent aucun accès à une organisation cliente.", "Les documents du chatbot restent privés et limités par votre plan."] },
      { title: "Organisations rejointes", steps: ["Une organisation apparaît après acceptation d’une invitation et validation du membership.", "Le rôle proposé est propre à cette organisation.", "Vous ne pouvez pas modifier ses données administratives sans permission."] },
      { title: "Relations", steps: ["Une relation d’entreprise utilise le moteur canonique d’identité et consentement.", "Une relation active n’accorde pas automatiquement un accès ERP, médical ou financier.", "La révocation conserve l’historique tout en retirant les capacités associées."] },
    ],
  },
  profile: {
    slug: "profile",
    title: "Guide du Profil",
    summary: "Gérer l’identité personnelle, la photo, la visibilité et les informations professionnelles.",
    sections: [
      { title: "Informations personnelles", steps: ["Mettez à jour votre nom, téléphone, fonction, localisation et biographie.", "L’adresse e-mail principale ne se modifie pas silencieusement depuis ce formulaire.", "Les champs privés ne sont pas publiés sans politique ou consentement explicite."] },
      { title: "Photo", steps: ["Choisissez une image PNG, JPG ou WebP.", "L’image est recadrée et compressée avant l’envoi.", "L’avatar mis à jour est réutilisé dans la navigation et les surfaces autorisées."] },
      { title: "Visibilité", steps: ["Le consentement public concerne uniquement les éléments clairement indiqués.", "Retirez le consentement pour empêcher les futurs affichages publics autorisés.", "Les informations sensibles restent privées par défaut."] },
    ],
  },
  settings: {
    slug: "settings",
    title: "Guide des Paramètres",
    summary: "Configurer la langue, le fuseau, l’apparence, les notifications, la session, les appels et la confidentialité.",
    sections: [
      { title: "Préférences", steps: ["Modifiez uniquement les options réellement supportées.", "Enregistrez puis rechargez la page pour vérifier la persistance.", "La langue et le fuseau influencent les textes, dates et heures applicables."] },
      { title: "Session", steps: ["Réglez la durée d’inactivité parmi les valeurs autorisées.", "La session signée est renouvelée dans la limite de sa durée absolue.", "La révocation multi-appareils n’est pas affichée tant qu’un registre serveur de sessions n’est pas disponible."] },
      { title: "Web Push", steps: ["Le navigateur, la configuration serveur et votre préférence doivent tous être compatibles.", "Une souscription est propre à un appareil et peut être retirée depuis celui-ci.", "Les notifications Push ne contiennent pas de données sensibles inutiles."] },
    ],
  },
  notifications: {
    slug: "notifications",
    title: "Guide des Notifications",
    summary: "Rechercher, filtrer, lire et ouvrir les objets précis liés aux événements du compte.",
    sections: [
      { title: "Recherche et pagination", steps: ["Utilisez la recherche serveur pour limiter l’historique chargé.", "Parcourez les pages sans charger toutes les notifications en mémoire.", "Les filtres rapides s’appliquent à la page actuellement chargée."] },
      { title: "Liens profonds", steps: ["Cliquez sur une notification pour ouvrir l’objet concerné.", "L’accès est revérifié au moment de l’ouverture.", "Si l’objet n’est plus accessible, revenez au centre de notifications ou au Dashboard."] },
      { title: "Visibilité globale", steps: ["Les invitations et demandes d’une entreprise non encore rejointe restent visibles depuis le compte personnel.", "Les notifications privées d’une organisation restent filtrées par contexte et membership.", "La suppression d’une notification ne supprime jamais son objet métier."] },
    ],
  },
  invitations: {
    slug: "invitations",
    title: "Guide des Invitations entreprise",
    summary: "Examiner, accepter ou refuser une invitation à rejoindre une organisation cliente.",
    sections: [
      { title: "Avant de répondre", steps: ["Vérifiez l’organisation, l’initiateur et le rôle proposé.", "Une invitation reste visible dans le compte personnel avant l’adhésion.", "Une organisation inactive ou supprimée ne peut pas être rejointe."] },
      { title: "Acceptation", steps: ["L’acceptation active le membership prévu.", "Une nouvelle tentative identique retourne le même résultat sans doublon.", "Après acceptation, vous pouvez choisir de basculer vers le nouvel espace."] },
      { title: "Refus", steps: ["Le refus retire l’invitation active et conserve l’audit.", "Le même lien ne peut plus être utilisé comme une invitation en attente.", "L’émetteur peut être notifié sans recevoir de données sensibles."] },
    ],
  },
  "company-relationships": {
    slug: "company-relationships",
    title: "Guide des Relations avec les entreprises",
    summary: "Traiter les demandes, consentements, activations et révocations issus du moteur canonique de relations.",
    sections: [
      { title: "Demandes et consentements", steps: ["Ouvrez la relation précise depuis le Dashboard ou une notification.", "Lisez l’objectif et les conséquences avant de consentir.", "Aucune relation ne doit être créée par simple ressemblance de nom ou d’e-mail."] },
      { title: "Relation active", steps: ["Consultez l’organisation, le type de relation et le statut.", "Les capacités dérivées restent limitées aux permissions explicitement accordées.", "Une relation ne remplace jamais un membership d’organisation."] },
      { title: "Révocation", steps: ["La révocation retire les capacités dérivées.", "Les liens devenus interdits refusent l’accès de manière sûre.", "L’historique reste consultable selon la politique de conservation."] },
    ],
  },
};

export function getStandardPersonalWorkspaceGuide(value: string | undefined) {
  const slug = value as StandardGuideSlug | undefined;
  return slug ? STANDARD_PERSONAL_WORKSPACE_GUIDES[slug] || null : null;
}
