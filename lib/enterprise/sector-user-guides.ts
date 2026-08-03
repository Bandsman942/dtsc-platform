import type { FinanceUserGuide } from "@/lib/enterprise/finance-user-guides";

export type SectorGuideLink = {
  code: string;
  label: string;
  reason: string;
};

export type SectorUserGuide = FinanceUserGuide & {
  relatedModules: SectorGuideLink[];
  limitations?: string[];
};

export const SECTOR_USER_GUIDES: Record<string, SectorUserGuide> = {
  PATIENTS: {
    title: "Patients",
    purpose: "Créer et tenir le référentiel patient de l’établissement, puis accéder aux rendez-vous, consultations, dossiers médicaux et documents sans exiger un compte DTSC.",
    prerequisites: [
      "Disposer de la permission de consultation Patients ; la création, la modification et l’archivage exigent leurs permissions propres.",
      "Préparer au minimum l’identité, un téléphone, une adresse et un contact d’urgence.",
      "Une liaison à un compte DTSC reste facultative et passe par Relations avec les entreprises avec consentement explicite.",
    ],
    steps: [
      "Recherchez par nom, téléphone ou numéro patient, puis utilisez les filtres Sexe, Statut et Date de création.",
      "Touchez Nouveau patient et renseignez l’identité, les coordonnées, l’adresse et le contact d’urgence.",
      "Ajoutez uniquement les informations médicales de base autorisées, notamment groupe sanguin, allergies, antécédents importants et traitements chroniques.",
      "Enregistrez puis ouvrez le détail pour consulter l’historique, les objets liés et les dispensations autorisées.",
      "Utilisez le menu d’actions pour modifier, archiver ou ouvrir un rendez-vous, une consultation, un dossier médical ou un document lié.",
      "Pour relier le patient à un compte DTSC, envoyez une proposition de relation et attendez l’acceptation de l’utilisateur.",
    ],
    workflow: [
      "Actif → Inactif → Archivé ; le statut Décédé exige une action motivée et historisée.",
      "Fiche patient indépendante → Proposition de liaison DTSC → Consentement → Relation active → Révocation éventuelle, sans suppression de la fiche patient.",
    ],
    controls: [
      "Aucune fusion automatique n’est réalisée sur le nom, le téléphone, l’adresse ou la date de naissance.",
      "Les informations sensibles sont masquées sans permission médicale appropriée.",
      "Toutes les références et lectures restent limitées à l’entreprise active.",
    ],
    troubleshooting: [
      "Un patient n’apparaît pas dans un autre module : vérifiez qu’il est actif et enregistré dans la même entreprise.",
      "Une information médicale est masquée : votre rôle ne possède pas la permission de lecture sensible.",
      "Une liaison DTSC n’est pas active : vérifiez son statut dans Relations avec les entreprises et le consentement de l’utilisateur.",
    ],
    relatedModules: [
      { code: "APPOINTMENTS", label: "Rendez-vous", reason: "Planifier la prochaine prise en charge du patient." },
      { code: "CONSULTATIONS", label: "Consultations", reason: "Documenter une consultation clinique du patient." },
      { code: "MEDICAL_RECORDS", label: "Dossiers médicaux", reason: "Consulter la vue longitudinale et les alertes médicales." },
      { code: "MEDICAL_DOCUMENTS", label: "Documents médicaux", reason: "Téléverser et gérer les fichiers privés liés au patient." },
      { code: "INSURANCE_COVERAGE", label: "Assurances et prises en charge", reason: "Gérer la couverture financière du patient." },
    ],
  },

  APPOINTMENTS: {
    title: "Rendez-vous",
    purpose: "Planifier un patient avec un professionnel et un service, puis suivre les transitions jusqu’à la réalisation ou la conversion en consultation.",
    prerequisites: [
      "Patient actif dans le module Patients.",
      "Professionnel membre de l’entreprise et service configuré lorsque ces affectations sont requises.",
      "Permission de création ou de transition adaptée à l’action prévue.",
    ],
    steps: [
      "Choisissez la vue Liste ou Planning et filtrez par statut, priorité, type, professionnel et période.",
      "Touchez Nouveau rendez-vous, sélectionnez le patient, le professionnel et le service.",
      "Saisissez la date, l’heure, la durée estimée, le motif administratif, le type et la priorité.",
      "Confirmez le rendez-vous puis utilisez les actions autorisées pour le placer en attente, démarrer, terminer, annuler ou marquer l’absence.",
      "Convertissez le rendez-vous en consultation lorsque le module Consultations est actif.",
      "Consultez le détail et l’historique pour vérifier chaque changement de statut et son acteur.",
    ],
    workflow: [
      "Planifié → Confirmé → En attente → En cours → Réalisé.",
      "Planifié ou Confirmé → Annulé ou Absent selon la situation.",
      "Rendez-vous admissible → Converti en consultation, une seule fois.",
    ],
    controls: [
      "La conversion est idempotente et ne crée pas plusieurs consultations pour le même rendez-vous.",
      "Les modifications d’un rendez-vous existant demandent une confirmation explicite.",
      "Les notifications utilisent un motif administratif générique et n’exposent aucune donnée clinique sensible.",
    ],
    troubleshooting: [
      "Patient absent : vérifiez son statut actif et son entreprise.",
      "Action de transition absente : votre rôle ne dispose pas de la permission correspondante ou le statut actuel ne l’autorise pas.",
      "Conversion refusée : vérifiez que Consultations est actif et qu’aucune consultation n’a déjà été créée.",
    ],
    relatedModules: [
      { code: "PATIENTS", label: "Patients", reason: "Créer ou vérifier la fiche du patient." },
      { code: "CARE_TEAM", label: "Équipe médicale", reason: "Configurer les professionnels, services et disponibilités." },
      { code: "CONSULTATIONS", label: "Consultations", reason: "Poursuivre le rendez-vous dans le parcours clinique." },
    ],
  },

  CONSULTATIONS: {
    title: "Consultations",
    purpose: "Documenter le parcours clinique, les constantes, l’examen, le diagnostic, la conduite à tenir et le suivi dans un dossier audité.",
    prerequisites: [
      "Patient actif et professionnel autorisé.",
      "Rendez-vous facultatif ; sa sélection préremplit le patient, le professionnel, le service, le motif et la priorité.",
      "Permission médicale sensible pour consulter ou modifier le contenu clinique protégé.",
    ],
    steps: [
      "Recherchez ou filtrez les consultations par statut, priorité, type, professionnel et période.",
      "Touchez Nouvelle consultation puis sélectionnez le patient et, si disponible, le rendez-vous lié.",
      "Renseignez le motif, l’histoire clinique, les antécédents pertinents et les symptômes.",
      "Saisissez les constantes vitales ; l’IMC est calculé lorsque le poids et la taille sont valides.",
      "Complétez l’examen, le diagnostic, la conduite à tenir, les examens demandés et les recommandations de suivi.",
      "Enregistrez puis utilisez les actions pour démarrer, mettre en attente d’examens, demander une revue, clôturer, rouvrir ou annuler selon vos permissions.",
    ],
    workflow: [
      "Brouillon → En cours → En attente d’examens ou À revoir → Clôturée.",
      "Clôturée → Rouverte uniquement par une action autorisée et motivée.",
      "Brouillon ou En cours → Annulée avec motif conservé.",
    ],
    controls: [
      "Une consultation clôturée n’est jamais modifiée silencieusement.",
      "Le texte de prescription clinique ne diminue pas automatiquement le stock ; la dispensation passe par Pharmacie interne.",
      "Finance ne reçoit ni diagnostic, ni note clinique, ni résultat de laboratoire inutile.",
    ],
    troubleshooting: [
      "Rendez-vous absent : vérifiez qu’il appartient au patient et à la même entreprise.",
      "Modification refusée après clôture : utilisez l’action Rouvrir avec un motif si votre permission l’autorise.",
      "Données sensibles masquées : demandez la permission clinique appropriée à l’administrateur Santé.",
    ],
    relatedModules: [
      { code: "APPOINTMENTS", label: "Rendez-vous", reason: "Retrouver le rendez-vous à l’origine de la consultation." },
      { code: "MEDICAL_RECORDS", label: "Dossiers médicaux", reason: "Intégrer la consultation dans la vue longitudinale." },
      { code: "LABORATORY", label: "Laboratoire", reason: "Créer et suivre les examens demandés." },
      { code: "INTERNAL_PHARMACY", label: "Pharmacie interne", reason: "Vérifier et dispenser une prescription." },
      { code: "MEDICAL_BILLING", label: "Facturation médicale", reason: "Facturer les prestations sans exposer les données cliniques." },
    ],
  },

  MEDICAL_RECORDS: {
    title: "Dossiers médicaux",
    purpose: "Maintenir un dossier principal unique par patient avec synthèse, antécédents, allergies, traitements, alertes et notes confidentielles.",
    prerequisites: [
      "Patient actif sans autre dossier médical principal dans l’entreprise.",
      "Permission de création ou de modification du dossier.",
      "Permission renforcée pour les notes confidentielles et les détails médicaux sensibles.",
    ],
    steps: [
      "Recherchez le patient ou le numéro de dossier et filtrez par statut.",
      "Touchez Nouveau dossier et sélectionnez un patient qui ne possède pas encore de dossier principal.",
      "Choisissez le niveau de confidentialité puis saisissez le résumé, les problèmes actifs, les facteurs de risque et les recommandations.",
      "Ouvrez le détail pour consulter les consultations, demandes laboratoire et dispensations liées.",
      "Ajoutez des antécédents, allergies, traitements, alertes ou notes confidentielles selon vos permissions.",
      "Archivez ou réactivez le dossier avec un motif obligatoire et historisé.",
    ],
    workflow: [
      "Actif → Archivé → Réactivé par action motivée.",
      "Élément longitudinal créé → actif ou clôturé selon sa catégorie, avec auteur et date conservés.",
    ],
    controls: [
      "Un seul dossier médical principal est autorisé par patient et par entreprise.",
      "Les niveaux Équipe médicale autorisée, Accès médical restreint et Très confidentiel renforcent la visibilité.",
      "L’archivage conserve toutes les consultations, analyses, dispensations et traces d’accès.",
    ],
    troubleshooting: [
      "Patient absent du formulaire : il possède peut-être déjà un dossier principal ou n’est pas actif.",
      "Notes confidentielles indisponibles : votre permission médicale renforcée manque.",
      "Une consultation ou analyse n’apparaît pas : vérifiez qu’elle est liée au même patient dans la même entreprise.",
    ],
    relatedModules: [
      { code: "PATIENTS", label: "Patients", reason: "Consulter l’identité administrative du patient." },
      { code: "CONSULTATIONS", label: "Consultations", reason: "Voir les épisodes cliniques du dossier." },
      { code: "LABORATORY", label: "Laboratoire", reason: "Voir les demandes et résultats autorisés." },
      { code: "INTERNAL_PHARMACY", label: "Pharmacie interne", reason: "Voir les dispensations liées." },
      { code: "MEDICAL_DOCUMENTS", label: "Documents médicaux", reason: "Gérer les pièces privées du dossier." },
    ],
  },

  CARE_TEAM: {
    title: "Équipe médicale",
    purpose: "Affecter les membres de l’entreprise à des postes, services et spécialités Santé, puis gérer leur disponibilité et leurs permissions sectorielles.",
    prerequisites: [
      "Le professionnel doit déjà être membre actif de l’entreprise.",
      "Poste et service configurés dans l’administration de l’entreprise.",
      "Permission renforcée pour modifier les permissions Santé ou créer une spécialité.",
    ],
    steps: [
      "Consultez les indicateurs de professionnels actifs, disponibles, suspendus et sans permissions.",
      "Filtrez par poste, service, spécialité ou statut.",
      "Touchez Affecter un membre, puis choisissez le membre, le poste, le service, la spécialité et le superviseur éventuel.",
      "Renseignez le numéro professionnel, l’ordre, le niveau d’expérience et le domaine de compétence.",
      "Définissez la disponibilité habituelle, les jours, les horaires et la capacité journalière.",
      "Attribuez uniquement les permissions Santé nécessaires, puis enregistrez.",
      "Utilisez les actions motivées pour suspendre, réactiver ou archiver une affectation.",
    ],
    workflow: [
      "En attente de validation → Actif → Inactif ou Suspendu → Réactivé ou Archivé.",
      "Disponible, Indisponible, En congé, En garde ou En consultation selon la situation opérationnelle.",
    ],
    controls: [
      "Une affectation Santé ne remplace ni le membership de l’entreprise ni le dossier RH.",
      "La révocation d’une relation DTSC ne supprime pas l’affectation métier.",
      "Les salaires, sanctions, appréciations et documents RH privés ne sont jamais partagés par ce module.",
    ],
    troubleshooting: [
      "Membre absent : il n’est pas actif dans l’entreprise ou possède déjà une affectation incompatible.",
      "Permission non modifiable : vous ne possédez pas le droit de gérer les permissions Santé.",
      "Professionnel absent des rendez-vous : vérifiez son statut actif et sa disponibilité.",
    ],
    relatedModules: [
      { code: "APPOINTMENTS", label: "Rendez-vous", reason: "Assigner les professionnels disponibles." },
      { code: "CONSULTATIONS", label: "Consultations", reason: "Définir les professionnels responsables." },
      { code: "LABORATORY", label: "Laboratoire", reason: "Affecter prescripteurs, préleveurs et validateurs." },
      { code: "HUMAN_RESOURCES", label: "Ressources humaines", reason: "Gérer séparément le dossier RH et les informations privées." },
    ],
  },

  LABORATORY: {
    title: "Laboratoire",
    purpose: "Gérer une demande d’analyse depuis la prescription jusqu’à la validation et la publication sécurisée du résultat.",
    prerequisites: [
      "Patient et prescripteur actifs ; consultation liée lorsque disponible.",
      "Examen du catalogue laboratoire configuré.",
      "Permissions distinctes selon la création, le prélèvement, la saisie, la validation, la correction ou la transmission.",
    ],
    steps: [
      "Créez la demande en choisissant le patient, le prescripteur, l’examen et la priorité.",
      "Enregistrez le prélèvement, le type d’échantillon et les dates utiles.",
      "Saisissez le résultat, les valeurs, unités, références et l’indicateur d’anomalie.",
      "Marquez le résultat critique lorsque la valeur l’exige ; la notification restera générique.",
      "Faites vérifier puis valider le résultat par un utilisateur autorisé.",
      "Publiez ou transmettez le résultat au professionnel autorisé et rattachez le document si nécessaire.",
      "Pour corriger un résultat validé, utilisez l’action de correction historisée au lieu de modifier silencieusement la valeur.",
    ],
    workflow: [
      "Demande → Prélèvement → Analyse → Résultat saisi → Vérifié → Validé → Publié ou transmis.",
      "Résultat validé → Correction contrôlée avec motif, version et auteur conservés.",
    ],
    controls: [
      "Le contenu d’un résultat critique n’est jamais inclus dans une notification non sécurisée.",
      "Le validateur et les permissions sont contrôlés côté serveur.",
      "Les références patient, consultation et prescripteur sont limitées à la même entreprise.",
    ],
    troubleshooting: [
      "Examen absent : vérifiez le catalogue laboratoire et son statut.",
      "Validation refusée : votre rôle ne possède pas la permission de validation ou une étape précédente manque.",
      "Correction refusée : utilisez l’action dédiée et fournissez un motif explicite.",
    ],
    relatedModules: [
      { code: "CONSULTATIONS", label: "Consultations", reason: "Retrouver la demande clinique à l’origine de l’examen." },
      { code: "MEDICAL_RECORDS", label: "Dossiers médicaux", reason: "Afficher le résultat dans la vue longitudinale autorisée." },
      { code: "MEDICAL_DOCUMENTS", label: "Documents médicaux", reason: "Joindre le compte rendu ou le résultat signé." },
      { code: "CARE_TEAM", label: "Équipe médicale", reason: "Configurer prescripteurs, laborantins et validateurs." },
    ],
  },

  INTERNAL_PHARMACY: {
    title: "Pharmacie interne",
    purpose: "Vérifier une prescription, sélectionner un lot vendable selon FEFO, dispenser et créer les mouvements et liens financiers autorisés.",
    prerequisites: [
      "Produit Pharmacy actif, stock disponible et lot non expiré, non bloqué et non rappelé.",
      "Patient et prescription ou consultation disponibles selon le parcours.",
      "Pharmacien autorisé lorsque la validation est obligatoire.",
    ],
    steps: [
      "Recherchez la prescription ou la consultation et vérifiez le patient.",
      "Contrôlez le produit, la dose, la quantité, la disponibilité et les avertissements.",
      "Laissez le système sélectionner les lots vendables selon FEFO ou justifiez toute dérogation autorisée.",
      "Faites valider par le pharmacien lorsque la règle du produit l’exige.",
      "Confirmez la dispensation pour créer un mouvement de stock unique.",
      "Créez la facturation éventuelle par le moteur financier commun, sans facture Health parallèle.",
    ],
    workflow: [
      "Prescription → Vérification → Disponibilité → Sélection FEFO → Validation → Dispensation.",
      "Dispensation confirmée → Mouvement de stock → Facturation éventuelle → Paiement ou créance commune.",
    ],
    controls: [
      "Un lot expiré, bloqué, rappelé ou insuffisant ne peut pas être dispensé.",
      "La dispensation est idempotente et ne crée pas deux mouvements ou deux factures.",
      "Les paiements et allocations restent dans le moteur Finance commun.",
    ],
    troubleshooting: [
      "Aucun lot proposé : vérifiez les péremptions, blocages, rappels, emplacements et quantités.",
      "Validation pharmacien requise : connectez-vous avec un pharmacien autorisé ou assignez le validateur.",
      "Facturation absente : vérifiez la configuration du service et du module Facturation médicale.",
    ],
    relatedModules: [
      { code: "CONSULTATIONS", label: "Consultations", reason: "Retrouver l’indication et la prescription clinique." },
      { code: "MEDICINES_PRODUCTS", label: "Produits et médicaments", reason: "Gérer les données pharmaceutiques du produit." },
      { code: "BATCH_EXPIRY", label: "Lots et péremptions", reason: "Contrôler les lots vendables et FEFO." },
      { code: "STOCK_INVENTORY", label: "Stock et inventaire", reason: "Vérifier les quantités et mouvements." },
      { code: "MEDICAL_BILLING", label: "Facturation médicale", reason: "Facturer la dispensation avec une facture commune." },
    ],
  },

  MEDICAL_BILLING: {
    title: "Facturation médicale",
    purpose: "Créer une facture spécialisée reliée à une facture commune unique et ventiler le montant entre patient, assurance et autre prise en charge.",
    prerequisites: [
      "Patient actif et prestation, consultation ou service source disponible.",
      "Catalogue ou services facturables, devise, taxes et période Finance configurés.",
      "Assureur et prise en charge disponibles pour une ventilation assurance.",
    ],
    steps: [
      "Créez la facture médicale et sélectionnez le patient ainsi que la source de prestation.",
      "Ajoutez les lignes, quantités, prix, taxes et documents autorisés.",
      "Renseignez la part patient, la part assurance et l’autre prise en charge éventuelle.",
      "Vérifiez que la somme des parts correspond au total recalculé côté serveur.",
      "Soumettez et validez selon le workflow disponible, puis émettez la facture commune.",
      "Enregistrez les paiements patient ou assureur dans Paiements et confirmez leurs allocations.",
      "Consultez le détail pour vérifier la facture commune, la créance, les allocations et le solde restant.",
    ],
    workflow: [
      "Brouillon → Soumis → Validé ou Approuvé → Émis/Comptabilisé selon la configuration.",
      "Créance ouverte → Partiellement payée → Payée uniquement après allocations confirmées.",
    ],
    controls: [
      "Une facture médicale financière possède une seule facture commune.",
      "TOTAL = part patient + part assurance + autre prise en charge.",
      "Finance ne reçoit aucune donnée clinique inutile.",
    ],
    troubleshooting: [
      "Ventilation refusée : les parts ne correspondent pas au total ou dépassent la couverture autorisée.",
      "Statut payé non appliqué : vérifiez les paiements confirmés et leurs allocations.",
      "Source absente : vérifiez le patient, la consultation, le service et leur entreprise.",
    ],
    relatedModules: [
      { code: "PATIENTS", label: "Patients", reason: "Identifier le patient facturé." },
      { code: "CONSULTATIONS", label: "Consultations", reason: "Retrouver la prestation source sans exposer les notes cliniques à Finance." },
      { code: "INSURANCE_COVERAGE", label: "Assurances et prises en charge", reason: "Déterminer la part assurance autorisée." },
      { code: "FINANCE_RECEIVABLES", label: "Créances", reason: "Suivre la facture commune et son solde." },
      { code: "FINANCE_PAYMENTS", label: "Paiements", reason: "Enregistrer et allouer les règlements." },
    ],
  },

  INSURANCE_COVERAGE: {
    title: "Assurances et prises en charge",
    purpose: "Vérifier l’éligibilité, demander une prise en charge et suivre la couverture jusqu’à la facture, la créance, le paiement et l’allocation communs.",
    prerequisites: [
      "Patient actif, assureur enregistré comme tiers commun et régime ou adhésion disponibles.",
      "Prestation ou facture source selon l’étape du parcours.",
      "Documents justificatifs privés lorsque l’assureur les exige.",
    ],
    steps: [
      "Enregistrez l’assureur, le régime, le bénéficiaire, le numéro d’adhésion et les dates de validité.",
      "Renseignez le plafond, le taux, les exclusions et l’autorisation préalable éventuelle.",
      "Créez la demande de prise en charge et joignez les documents autorisés.",
      "Enregistrez la réponse, la part couverte, la part patient et le motif communicable d’un refus.",
      "Liez la prise en charge à la facture médicale commune.",
      "Suivez la créance assurance, le paiement et l’allocation dans les modules Finance communs.",
    ],
    workflow: [
      "Éligibilité → Demande → En attente → Acceptée, Partielle ou Refusée → Prestation → Facture.",
      "Créance assurance → Paiement → Allocation confirmée → Solde mis à jour.",
    ],
    controls: [
      "La couverture ne crée ni créance ni paiement sectoriel parallèle.",
      "Les montants sont bornés par la facture et la couverture autorisée.",
      "Les notes cliniques et résultats inutiles ne sont pas transmis à Finance ou à l’assureur.",
    ],
    troubleshooting: [
      "Assureur absent : créez ou activez le tiers commun correspondant.",
      "Couverture supérieure refusée : vérifiez le plafond, le taux et le montant de la facture.",
      "Paiement assurance non visible : vérifiez sa confirmation et son allocation à la créance correcte.",
    ],
    relatedModules: [
      { code: "PATIENTS", label: "Patients", reason: "Gérer l’adhésion et le bénéficiaire." },
      { code: "MEDICAL_BILLING", label: "Facturation médicale", reason: "Ventiler la facture selon la couverture." },
      { code: "CRM_CUSTOMERS", label: "Tiers", reason: "Gérer l’assureur dans le référentiel commun." },
      { code: "FINANCE_RECEIVABLES", label: "Créances", reason: "Suivre la part assurance à recevoir." },
      { code: "FINANCE_PAYMENTS", label: "Paiements", reason: "Enregistrer le règlement de l’assureur." },
    ],
  },

  QUALITY_INCIDENTS: {
    title: "Incidents qualité Health",
    purpose: "Déclarer, qualifier, analyser et clôturer un incident qualité avec actions correctives, responsables, échéances et confidentialité patient.",
    prerequisites: [
      "Permission de déclaration ou de gestion des incidents.",
      "Service concerné et responsables disponibles.",
      "Patient lié uniquement lorsque cela est strictement nécessaire et autorisé.",
    ],
    steps: [
      "Créez l’incident avec le type, le service, la date, la description et la gravité.",
      "Liez le patient seulement si l’identification est indispensable au traitement de l’incident.",
      "Qualifiez l’impact et assignez les responsables.",
      "Documentez l’analyse de cause et les actions correctives avec leurs échéances.",
      "Joignez les documents privés nécessaires.",
      "Vérifiez les actions puis clôturez l’incident avec une conclusion historisée.",
    ],
    workflow: [
      "Déclaration → Qualification → Analyse de cause → Actions correctives → Vérification → Clôture.",
      "Une réouverture éventuelle exige une permission et un motif.",
    ],
    controls: [
      "Les tableaux généraux minimisent les données identifiantes du patient.",
      "Finance et les utilisateurs non autorisés ne voient pas les détails médicaux de l’incident.",
      "Chaque changement de gravité, responsable, statut ou échéance est audité.",
    ],
    troubleshooting: [
      "Patient non sélectionnable : votre permission ou le niveau de confidentialité ne permet pas la liaison.",
      "Clôture refusée : des actions correctives ou vérifications obligatoires restent ouvertes.",
      "Document indisponible : vérifiez la confidentialité et votre droit de téléchargement.",
    ],
    relatedModules: [
      { code: "PATIENTS", label: "Patients", reason: "Identifier le patient uniquement lorsque nécessaire." },
      { code: "CARE_TEAM", label: "Équipe médicale", reason: "Assigner les responsables des actions." },
      { code: "MEDICAL_DOCUMENTS", label: "Documents médicaux", reason: "Conserver les preuves privées de l’incident." },
    ],
  },

  MEDICAL_DOCUMENTS: {
    title: "Documents médicaux",
    purpose: "Téléverser, classer, versionner, valider, télécharger et archiver des documents Health privés reliés aux objets métier autorisés.",
    prerequisites: [
      "Stockage privé configuré et permission de téléversement.",
      "Fichier PDF, image, DOCX, XLSX ou TXT de 10 Mo maximum lorsque le téléversement est requis.",
      "Patient ou objet Health lié selon le type de document.",
    ],
    steps: [
      "Filtrez les documents par statut et niveau de confidentialité.",
      "Touchez Ajouter un document et renseignez le titre, le type, le module source et la confidentialité.",
      "Liez le patient puis, si nécessaire, la consultation, la demande laboratoire, la facture, la couverture ou l’incident compatibles.",
      "Sélectionnez le fichier privé et indiquez s’il exige une validation, un accès restreint ou contient des données sensibles.",
      "Enregistrez puis utilisez les actions pour télécharger, modifier les métadonnées, ajouter une version, valider, archiver ou restaurer.",
      "Consultez le détail pour vérifier les versions, l’auteur, les dates et l’historique.",
    ],
    workflow: [
      "Brouillon → Actif ou En attente de validation → Validé.",
      "Document remplacé par une nouvelle version → Remplacé ; document retiré → Archivé → Restauré si autorisé.",
      "Expiration éventuelle signalée sans suppression du fichier ni de l’historique.",
    ],
    controls: [
      "Une URL saisie manuellement ne remplace jamais le téléversement réel.",
      "Les téléchargements passent par une route serveur privée avec permission et audit.",
      "Finance ne peut pas télécharger un document médical sans permission Health explicite.",
    ],
    troubleshooting: [
      "Champ fichier absent : le stockage ou votre permission de téléversement n’est pas configuré.",
      "Objet lié absent : sélectionnez d’abord le patient ou vérifiez l’appartenance à la même entreprise.",
      "Modification refusée : les documents validés, remplacés ou archivés utilisent les actions de version ou de restauration.",
    ],
    relatedModules: [
      { code: "PATIENTS", label: "Patients", reason: "Relier le document à son patient." },
      { code: "CONSULTATIONS", label: "Consultations", reason: "Relier un compte rendu ou certificat à la consultation." },
      { code: "LABORATORY", label: "Laboratoire", reason: "Relier un résultat ou compte rendu d’analyse." },
      { code: "MEDICAL_BILLING", label: "Facturation médicale", reason: "Relier facture ou reçu médical autorisé." },
      { code: "QUALITY_INCIDENTS", label: "Incidents qualité", reason: "Relier les preuves privées d’un incident." },
    ],
  },

  MEDICINES_PRODUCTS: {
    title: "Produits et médicaments",
    purpose: "Gérer la fiche pharmaceutique complète d’un produit et son lien avec le catalogue commun, la réglementation, le stockage et la tarification.",
    prerequisites: [
      "Permission de gestion des produits Pharmacy.",
      "Catégories, unités, devise et règles fiscales configurées lorsque nécessaires.",
      "Le produit financier ou commercial commun est réutilisé lorsqu’un lien catalogue est requis.",
    ],
    steps: [
      "Filtrez par catégorie, forme pharmaceutique, statut ou règle réglementaire.",
      "Touchez Nouveau produit et renseignez nom commercial, DCI, code interne, code-barres, fabricant et marque.",
      "Complétez la forme, le dosage, les unités, le conditionnement et la voie d’administration.",
      "Définissez ordonnance obligatoire, validation pharmacien, contrôle renforcé, vente libre et substitution générique.",
      "Configurez le suivi de stock, les seuils, l’emplacement, les températures et les protections contre lumière ou humidité.",
      "Renseignez les prix de référence, la devise, la taxe, la marge et les limites de remise.",
      "Enregistrez, consultez le détail, modifiez ou archivez le produit avec un motif.",
    ],
    workflow: [
      "Actif → Suspendu ou Inactif → Archivé ; réactivation selon les actions disponibles.",
      "Produit créé → relié au catalogue commun lorsque le parcours ventes, achats ou Finance l’exige.",
    ],
    controls: [
      "Le code interne est unique dans l’entreprise.",
      "Les règles de prescription et de validation pharmacien sont appliquées pendant la vente et la dispensation.",
      "La fiche produit ne remplace ni les lots ni les quantités physiques du stock.",
    ],
    troubleshooting: [
      "Produit absent d’une réception ou vente : vérifiez son statut actif et le suivi de stock.",
      "Prix refusé : vérifiez la devise, la taxe et les limites configurées.",
      "Archivage impossible : des opérations actives peuvent nécessiter une suspension préalable.",
    ],
    relatedModules: [
      { code: "CATALOG", label: "Catalogue commun", reason: "Utiliser la source commerciale et financière commune." },
      { code: "BATCH_EXPIRY", label: "Lots et péremptions", reason: "Créer et contrôler les lots du produit." },
      { code: "STOCK_INVENTORY", label: "Stock et inventaire", reason: "Suivre les quantités et mouvements." },
      { code: "SALES_DISPENSATION", label: "Ventes et dispensation", reason: "Appliquer les règles du produit pendant la vente." },
      { code: "PRESCRIPTIONS", label: "Ordonnances", reason: "Vérifier les produits soumis à prescription." },
    ],
  },

  BATCH_EXPIRY: {
    title: "Lots et péremptions",
    purpose: "Tracer chaque lot, sa réception, sa quantité, son emplacement, sa péremption, sa quarantaine, son rappel et son historique.",
    prerequisites: [
      "Produit Pharmacy actif et suivi de stock activé.",
      "Site, entrepôt ou emplacement configuré selon l’opération.",
      "Réception ou fournisseur disponible lorsque le lot provient d’un achat.",
    ],
    steps: [
      "Recherchez ou filtrez les lots par produit, péremption, statut, quarantaine, rappel ou chaîne du froid.",
      "Créez ou ouvrez le lot depuis une réception et renseignez le numéro, la fabrication, la péremption et l’emplacement.",
      "Vérifiez les quantités disponibles, réservées, bloquées et les mouvements.",
      "Utilisez les actions autorisées pour mettre en quarantaine, libérer, bloquer ou rappeler le lot.",
      "Documentez toute destruction ou ajustement avec motif, preuve et autorisation.",
      "Consultez l’historique avant toute décision sur un lot sensible.",
    ],
    workflow: [
      "Reçu → Disponible → Quarantaine ou Bloqué → Libéré si conforme.",
      "Disponible ou Quarantaine → Rappelé → Traitement et clôture du rappel.",
      "Lot expiré → Non vendable → Destruction ou ajustement contrôlé.",
    ],
    controls: [
      "Un lot expiré, bloqué, rappelé ou en quarantaine n’est pas vendable.",
      "Les dates et changements de statut sont audités.",
      "FEFO choisit le lot vendable dont la péremption est la plus proche.",
    ],
    troubleshooting: [
      "Lot absent du stock vendable : vérifiez son statut, sa péremption, son emplacement et sa quantité.",
      "Libération refusée : une justification, une permission ou un contrôle qualité manque.",
      "Rappel non effectif : vérifiez que le lot a bien été bloqué et que les responsables ont été notifiés.",
    ],
    relatedModules: [
      { code: "MEDICINES_PRODUCTS", label: "Produits et médicaments", reason: "Consulter les règles du produit." },
      { code: "STOCK_RECEIPTS", label: "Réceptions", reason: "Retrouver l’entrée ayant créé le lot." },
      { code: "STOCK_INVENTORY", label: "Stock et inventaire", reason: "Voir les quantités et mouvements du lot." },
      { code: "ALERTS_EXPIRY_LOW_STOCK", label: "Alertes et rappels", reason: "Traiter péremptions, quarantaines et rappels." },
    ],
  },

  STOCK_INVENTORY: {
    title: "Stock et inventaire Pharmacy",
    purpose: "Consulter le stock par produit, lot, site et emplacement, puis compter, justifier et faire approuver les écarts.",
    prerequisites: [
      "Produits, lots, sites, entrepôts et emplacements actifs.",
      "Permission de consultation du stock et permission distincte pour ajuster.",
      "Validateur indépendant lorsque l’écart exige une approbation.",
    ],
    steps: [
      "Choisissez la vue Stock, Mouvements, Inventaires ou Alertes selon le besoin.",
      "Filtrez par produit, lot, site, emplacement ou statut de blocage.",
      "Créez un inventaire et définissez le périmètre de comptage.",
      "Sur mobile, recherchez ou scannez le produit, confirmez le lot et saisissez la quantité comptée.",
      "Comparez avec la quantité théorique et justifiez chaque écart.",
      "Soumettez au validateur puis appliquez l’ajustement une seule fois après approbation.",
    ],
    workflow: [
      "Inventaire ouvert → Comptage → Écarts calculés → Soumis → Approuvé → Ajusté → Clôturé.",
      "Mouvement confirmé → immuable ; correction par mouvement inverse autorisé.",
    ],
    controls: [
      "Le stock négatif est bloqué lorsque la règle de l’entreprise l’interdit.",
      "Les mouvements sont idempotents et partagés avec le stock ERP commun.",
      "Un ajustement approuvé n’est appliqué qu’une seule fois.",
    ],
    troubleshooting: [
      "Produit ou lot absent : vérifiez son statut, son emplacement et le périmètre de l’inventaire.",
      "Écart non ajusté : la validation indépendante ou la justification manque.",
      "Quantité inattendue : consultez les mouvements de réception, vente, retour, perte et ajustement.",
    ],
    relatedModules: [
      { code: "MEDICINES_PRODUCTS", label: "Produits et médicaments", reason: "Vérifier le paramétrage du suivi de stock." },
      { code: "BATCH_EXPIRY", label: "Lots et péremptions", reason: "Contrôler le lot et son statut." },
      { code: "STOCK_RECEIPTS", label: "Réceptions", reason: "Voir les entrées de stock." },
      { code: "SALES_DISPENSATION", label: "Ventes et dispensation", reason: "Voir les sorties de stock." },
      { code: "RETURNS_ADJUSTMENTS_LOSSES", label: "Retours, ajustements et pertes", reason: "Expliquer les mouvements correctifs." },
    ],
  },

  STOCK_RECEIPTS: {
    title: "Entrées et réceptions Pharmacy",
    purpose: "Réceptionner une commande fournisseur commune, contrôler les quantités et la qualité, créer les lots puis alimenter le stock une seule fois.",
    prerequisites: [
      "Fournisseur et commande d’achat communs actifs.",
      "Produit Pharmacy, entrepôt et emplacement configurés.",
      "Documents et mesures de température disponibles lorsque la chaîne du froid s’applique.",
    ],
    steps: [
      "Sélectionnez la commande fournisseur à réceptionner.",
      "Comparez les lignes attendues et les quantités réellement reçues.",
      "Renseignez les écarts, le contrôle qualité et la température éventuelle.",
      "Créez ou sélectionnez les lots, puis saisissez fabrication, péremption et emplacement.",
      "Joignez les documents de réception ou de conformité.",
      "Validez la réception pour créer une entrée de stock unique et conserver le lien avec l’achat commun.",
    ],
    workflow: [
      "Commande commune → Réception en préparation → Contrôle → Lots complétés → Validée → Entrée de stock.",
      "Réception partielle → commande restant à recevoir ; réception complète → commande reçue selon les règles communes.",
    ],
    controls: [
      "Une réception validée ne crée qu’un mouvement d’entrée et un lien financier.",
      "Les quantités ne dépassent pas silencieusement le restant commandé.",
      "La réception n’est pas une facture fournisseur ; la dette reste dans Finance.",
    ],
    troubleshooting: [
      "Commande absente : vérifiez le fournisseur, son statut et les quantités restantes.",
      "Validation bloquée : complétez les lots, péremptions, emplacements et contrôles obligatoires.",
      "Stock doublé : n’essayez pas de valider deux fois ; utilisez l’historique et signalez l’anomalie.",
    ],
    relatedModules: [
      { code: "SUPPLIERS_ORDERS", label: "Fournisseurs et commandes", reason: "Retrouver la commande commune." },
      { code: "BATCH_EXPIRY", label: "Lots et péremptions", reason: "Créer et contrôler les lots reçus." },
      { code: "STOCK_INVENTORY", label: "Stock et inventaire", reason: "Vérifier l’entrée de stock." },
      { code: "FINANCE_PAYABLES", label: "Dettes fournisseurs", reason: "Enregistrer séparément la facture fournisseur." },
    ],
  },

  SALES_DISPENSATION: {
    title: "Ventes et dispensation Pharmacy",
    purpose: "Préparer un panier, vérifier prescription et stock, sélectionner les lots FEFO, valider, facturer et encaisser avec les moteurs communs.",
    prerequisites: [
      "Caisse ou compte financier actif selon le mode de règlement.",
      "Produit et lot vendables avec quantité suffisante.",
      "Prescription valide et pharmacien autorisé lorsque le produit l’exige.",
    ],
    steps: [
      "Recherchez le patient ou client, la prescription et les produits par nom ou code-barres.",
      "Ajoutez les lignes au panier et vérifiez quantités, prix, taxes, remises autorisées et avertissements.",
      "Laissez le système sélectionner les lots FEFO vendables.",
      "Présentez l’ordonnance ou obtenez la validation du pharmacien lorsque nécessaire.",
      "Confirmez la vente pour créer une sortie de stock et une facture commune uniques.",
      "Enregistrez le paiement commun et remettez le reçu.",
      "Ouvrez le détail pour contrôler lots, facture, paiement et historique.",
    ],
    workflow: [
      "Panier → Vérification → Validation pharmacien éventuelle → Vente confirmée → Sortie de stock → Facture → Paiement/Reçu.",
      "Retour autorisé → mouvement inverse ou procédure contrôlée, jamais modification silencieuse de la vente.",
    ],
    controls: [
      "Vente interdite pour lot expiré, bloqué, rappelé, en quarantaine ou quantité insuffisante.",
      "Ordonnance et validation pharmacien ne peuvent pas être contournées.",
      "Une vente ne crée qu’une facture, un paiement, une sortie de stock et une écriture.",
    ],
    troubleshooting: [
      "Produit non ajoutable : vérifiez prescription, statut du produit, lot vendable et stock.",
      "Paiement refusé : contrôlez la session de caisse, la devise, le montant et le mode de paiement.",
      "Lot FEFO inattendu : vérifiez les péremptions et les blocages des lots antérieurs.",
    ],
    relatedModules: [
      { code: "PRESCRIPTIONS", label: "Ordonnances", reason: "Vérifier la prescription et sa validité." },
      { code: "BATCH_EXPIRY", label: "Lots et péremptions", reason: "Contrôler FEFO et la vendabilité." },
      { code: "CASH_INVOICES_PAYMENTS", label: "Caisse, factures et paiements", reason: "Encaisser et suivre le reçu." },
      { code: "RETURNS_ADJUSTMENTS_LOSSES", label: "Retours, ajustements et pertes", reason: "Traiter un retour après vente." },
    ],
  },

  PRESCRIPTIONS: {
    title: "Ordonnances et prescriptions",
    purpose: "Enregistrer une ordonnance, contrôler sa validité et sa conformité, puis la relier à une dispensation autorisée.",
    prerequisites: [
      "Patient ou client, prescripteur et produit disponibles.",
      "Dates de prescription et de validité cohérentes.",
      "Pharmacien autorisé pour le contrôle ou la substitution lorsque requis.",
    ],
    steps: [
      "Créez l’ordonnance et sélectionnez le patient, le prescripteur et la date.",
      "Ajoutez les produits, doses, fréquences, durées, quantités et instructions.",
      "Joignez le document privé lorsque l’ordonnance est reçue sous forme de fichier.",
      "Vérifiez la validité, la conformité, la disponibilité et les règles de contrôle renforcé.",
      "Enregistrez la substitution générique autorisée avec son motif si elle est utilisée.",
      "Faites valider par le pharmacien puis ouvrez la dispensation liée.",
    ],
    workflow: [
      "Brouillon ou Reçue → À vérifier → Validée, Refusée ou Expirée → Partiellement ou totalement dispensée.",
      "Substitution proposée → acceptée ou refusée par le pharmacien selon les règles du produit.",
    ],
    controls: [
      "Une prescription expirée ou refusée ne permet pas la dispensation.",
      "Le contenu clinique n’est pas exposé aux utilisateurs Finance non autorisés.",
      "La quantité dispensée ne dépasse pas la quantité autorisée restante.",
    ],
    troubleshooting: [
      "Produit absent : vérifiez son statut et les règles de prescription.",
      "Validation refusée : la prescription est expirée, incomplète ou votre rôle n’est pas pharmacien autorisé.",
      "Dispensation indisponible : vérifiez les quantités restantes et les lots vendables.",
    ],
    relatedModules: [
      { code: "PATIENTS", label: "Patients", reason: "Vérifier la personne concernée lorsqu’elle est gérée par Health." },
      { code: "MEDICINES_PRODUCTS", label: "Produits et médicaments", reason: "Appliquer les règles pharmaceutiques." },
      { code: "SALES_DISPENSATION", label: "Ventes et dispensation", reason: "Délivrer les produits validés." },
      { code: "PHARMACY_DOCUMENTS", label: "Documents et conformité", reason: "Conserver l’ordonnance ou la preuve autorisée." },
    ],
  },

  SUPPLIERS_ORDERS: {
    title: "Fournisseurs et commandes Pharmacy",
    purpose: "Réutiliser les fournisseurs et achats communs tout en conservant licences, spécialités, qualité, température et documents réglementaires Pharmacy.",
    prerequisites: [
      "Fournisseur actif dans le référentiel commun.",
      "Produits, sites et entrepôts configurés.",
      "Permission d’achat et validateur indépendant lorsque requis.",
    ],
    steps: [
      "Créez ou sélectionnez le fournisseur commun et complétez ses informations Pharmacy autorisées.",
      "Vérifiez licences, documents, spécialités fournies, délais et contraintes de température.",
      "Créez la demande ou commande d’achat commune avec les produits et quantités.",
      "Soumettez à validation lorsque le workflow l’exige.",
      "Après approbation, suivez la commande jusqu’à la réception Pharmacy.",
      "Enregistrez séparément la facture fournisseur et le paiement dans Finance.",
    ],
    workflow: [
      "Demande d’achat → Soumise → Approuvée ou Retournée → Commande → Partiellement reçue → Reçue.",
      "Réception → facture fournisseur commune → dette → paiement et allocation.",
    ],
    controls: [
      "Aucun fournisseur financier Pharmacy parallèle n’est créé.",
      "La commande, la réception, la facture et le paiement restent des objets distincts.",
      "Les références sont revalidées dans la même entreprise.",
    ],
    troubleshooting: [
      "Fournisseur absent : vérifiez son rôle fournisseur et son statut dans le référentiel commun.",
      "Commande non réceptionnable : contrôlez son approbation et les quantités restantes.",
      "Dette absente : la réception ne crée pas automatiquement une facture fournisseur.",
    ],
    relatedModules: [
      { code: "CRM_CUSTOMERS", label: "Tiers", reason: "Gérer le fournisseur commun." },
      { code: "SUPPLIERS_PURCHASES", label: "Achats communs", reason: "Créer demandes et commandes d’achat." },
      { code: "STOCK_RECEIPTS", label: "Réceptions", reason: "Réceptionner les produits et créer les lots." },
      { code: "FINANCE_PAYABLES", label: "Dettes fournisseurs", reason: "Enregistrer la facture et la dette." },
      { code: "FINANCE_PAYMENTS", label: "Paiements", reason: "Régler le fournisseur." },
    ],
  },

  CASH_INVOICES_PAYMENTS: {
    title: "Caisse, factures et paiements Pharmacy",
    purpose: "Utiliser les sessions de caisse, factures, paiements, allocations et écritures communes pour les ventes Pharmacy.",
    prerequisites: [
      "Caisse et compte financier actifs.",
      "Caissier autorisé et session ouverte avant une vente en espèces.",
      "Validateur distinct pour la clôture lorsque la politique l’exige.",
    ],
    steps: [
      "Ouvrez une session de caisse avec le solde d’ouverture.",
      "Effectuez les ventes depuis Ventes et dispensation ; les factures et paiements apparaissent dans la vue sectorielle.",
      "Consultez le reçu, le caissier, les lignes et les allocations autorisées.",
      "Enregistrez les retours ou remboursements par les actions prévues.",
      "À la fin du service, comptez la caisse et expliquez tout écart.",
      "Soumettez la clôture au validateur indépendant puis vérifiez l’écriture commune.",
    ],
    workflow: [
      "Session ouverte → Opérations → Comptage → En attente de validation → Clôturée.",
      "Facture ouverte → paiement confirmé → allocation → payée.",
      "Retour ou remboursement → mouvement et document correctifs traçables.",
    ],
    controls: [
      "Aucune session de caisse, facture ou paiement Pharmacy parallèle n’est créé.",
      "Le caissier ne valide pas sa propre clôture lorsque la séparation des rôles est active.",
      "Le statut payé dépend des allocations confirmées.",
    ],
    troubleshooting: [
      "Vente en espèces refusée : ouvrez une session de caisse compatible.",
      "Clôture bloquée : complétez le comptage et justifiez l’écart.",
      "Facture non payée malgré le règlement : vérifiez la confirmation du paiement et son allocation.",
    ],
    relatedModules: [
      { code: "SALES_DISPENSATION", label: "Ventes et dispensation", reason: "Créer les ventes alimentant la caisse." },
      { code: "RETURNS_ADJUSTMENTS_LOSSES", label: "Retours, ajustements et pertes", reason: "Traiter retours et remboursements." },
      { code: "FINANCE_CASH", label: "Caisse commune", reason: "Consulter la session financière commune." },
      { code: "FINANCE_PAYMENTS", label: "Paiements", reason: "Voir les règlements et allocations." },
    ],
  },

  RETURNS_ADJUSTMENTS_LOSSES: {
    title: "Retours, ajustements et pertes",
    purpose: "Tracer les retours clients ou fournisseurs, pertes, casses, vols, péremptions, destructions et ajustements avec leur impact stock et financier.",
    prerequisites: [
      "Produit et lot concernés disponibles.",
      "Motif, responsable, date, preuve et autorisation selon le type d’opération.",
      "Permission d’approbation pour les impacts sensibles.",
    ],
    steps: [
      "Choisissez le type : retour client, retour fournisseur, perte, casse, vol, péremption, destruction ou ajustement.",
      "Sélectionnez le produit, le lot et la quantité.",
      "Renseignez le motif, la date, le responsable, la preuve et le commentaire.",
      "Vérifiez l’impact stock et l’impact financier proposés.",
      "Soumettez à autorisation lorsque le workflow l’exige.",
      "Confirmez pour créer le mouvement correctif unique.",
      "Pour corriger une opération confirmée, utilisez un mouvement inverse ou la procédure dédiée.",
    ],
    workflow: [
      "Brouillon → Soumis → Approuvé ou Refusé → Confirmé.",
      "Opération confirmée → Correction par mouvement inverse lié, jamais réécriture silencieuse.",
    ],
    controls: [
      "Produit, lot et quantité sont obligatoires pour toute opération de stock.",
      "Les impacts financiers utilisent les objets communs lorsque nécessaires.",
      "La même opération ne peut pas créer deux mouvements.",
    ],
    troubleshooting: [
      "Lot absent : vérifiez son emplacement, son statut et sa quantité disponible.",
      "Confirmation refusée : la preuve, l’autorisation ou la justification manque.",
      "Quantité incorrecte après correction : vérifiez le mouvement original et son mouvement inverse lié.",
    ],
    relatedModules: [
      { code: "STOCK_INVENTORY", label: "Stock et inventaire", reason: "Vérifier l’impact du mouvement." },
      { code: "BATCH_EXPIRY", label: "Lots et péremptions", reason: "Contrôler le lot concerné." },
      { code: "SALES_DISPENSATION", label: "Ventes et dispensation", reason: "Retrouver la vente lors d’un retour client." },
      { code: "STOCK_RECEIPTS", label: "Réceptions", reason: "Retrouver la réception lors d’un retour fournisseur." },
    ],
  },

  ALERTS_EXPIRY_LOW_STOCK: {
    title: "Alertes, péremptions et rappels",
    purpose: "Traiter les alertes Pharmacy comme une file opérationnelle avec responsable, priorité, échéance, action et historique.",
    prerequisites: [
      "Produits, lots, seuils et dates correctement configurés.",
      "Responsables disponibles pour la prise en charge.",
      "Permission de traitement ou de clôture adaptée au type d’alerte.",
    ],
    steps: [
      "Filtrez par type, gravité, priorité, statut, produit, lot ou échéance.",
      "Ouvrez une alerte de stock faible, péremption, expiration, quarantaine, rappel ou chaîne du froid.",
      "Prenez l’alerte en charge et assignez le responsable.",
      "Documentez l’action réalisée et l’échéance.",
      "Pour un rappel, bloquez le lot avant toute autre action et notifiez les responsables.",
      "Résolvez puis classez l’alerte lorsque les contrôles sont terminés.",
    ],
    workflow: [
      "Nouvelle → Prise en charge → En cours → Résolue → Classée.",
      "Rappel créé → lot bloqué → investigation et actions → rappel clôturé.",
    ],
    controls: [
      "La clôture d’une alerte ne réactive pas automatiquement un lot bloqué.",
      "Les notifications restent génériques lorsqu’une donnée patient ou réglementaire est sensible.",
      "Les actions de rappel et de libération sont auditées séparément.",
    ],
    troubleshooting: [
      "Alerte non générée : vérifiez seuils, péremption, statut du lot et paramètres Pharmacy.",
      "Lot encore vendable après rappel : vérifiez que l’action Bloquer le lot a été confirmée.",
      "Clôture refusée : des actions ou preuves obligatoires restent incomplètes.",
    ],
    relatedModules: [
      { code: "BATCH_EXPIRY", label: "Lots et péremptions", reason: "Bloquer, libérer ou rappeler le lot." },
      { code: "STOCK_INVENTORY", label: "Stock et inventaire", reason: "Analyser les quantités et blocages." },
      { code: "PHARMACY_SETTINGS", label: "Paramètres Pharmacy", reason: "Configurer seuils et délais d’alerte." },
      { code: "QUALITY_PHARMACOVIGILANCE", label: "Qualité et pharmacovigilance", reason: "Ouvrir une investigation qualité si nécessaire." },
    ],
  },

  QUALITY_PHARMACOVIGILANCE: {
    title: "Qualité et pharmacovigilance",
    purpose: "Déclarer et traiter un incident produit ou événement de pharmacovigilance avec données patient minimisées, actions et documents réglementaires.",
    prerequisites: [
      "Produit et lot disponibles lorsque l’événement les concerne.",
      "Patient lié uniquement lorsque strictement nécessaire.",
      "Responsables qualité et permissions de traitement configurés.",
    ],
    steps: [
      "Créez la déclaration avec le produit, le lot, la date, l’événement et la gravité.",
      "Ajoutez le patient uniquement si la réglementation ou l’analyse l’exige.",
      "Qualifiez l’événement et déterminez si une déclaration réglementaire est nécessaire.",
      "Assignez les actions correctives, responsables et échéances.",
      "Joignez les documents qualité ou réglementaires privés.",
      "Suivez les actions puis clôturez avec une conclusion et un historique complets.",
    ],
    workflow: [
      "Déclaration → Qualification → Analyse → Déclaration réglementaire éventuelle → Actions correctives → Suivi → Clôture.",
    ],
    controls: [
      "Les données patient sont minimisées et masquées aux rôles non autorisés.",
      "Finance n’accède pas au contenu de pharmacovigilance.",
      "Les changements de gravité, produit, lot, responsable et statut sont audités.",
    ],
    troubleshooting: [
      "Patient non accessible : votre permission ou la confidentialité ne permet pas la consultation.",
      "Clôture bloquée : une action corrective ou une déclaration obligatoire reste ouverte.",
      "Document absent : vérifiez le module Documents et conformité et la permission de téléchargement.",
    ],
    relatedModules: [
      { code: "MEDICINES_PRODUCTS", label: "Produits et médicaments", reason: "Identifier le produit concerné." },
      { code: "BATCH_EXPIRY", label: "Lots et péremptions", reason: "Identifier et bloquer le lot concerné." },
      { code: "ALERTS_EXPIRY_LOW_STOCK", label: "Alertes et rappels", reason: "Déclencher ou suivre un rappel." },
      { code: "PHARMACY_DOCUMENTS", label: "Documents et conformité", reason: "Conserver les preuves et déclarations." },
    ],
  },

  PHARMACY_DOCUMENTS: {
    title: "Documents et conformité Pharmacy",
    purpose: "Gérer licences, autorisations, certificats, fiches qualité, rappels, preuves de destruction et contrôles de température.",
    prerequisites: [
      "Stockage privé et permission de téléversement configurés.",
      "Propriétaire ou objet lié disponible : produit, lot, fournisseur, réception, rappel ou incident.",
      "Dates d’émission et d’expiration connues lorsque le document est renouvelable.",
    ],
    steps: [
      "Ajoutez le document et choisissez son type, son propriétaire et l’objet Pharmacy lié.",
      "Renseignez la date, l’expiration, le responsable, le statut et la description.",
      "Téléversez le fichier réel et vérifiez sa confidentialité.",
      "Soumettez à validation lorsque le document l’exige.",
      "Ajoutez une nouvelle version au lieu d’écraser silencieusement le fichier validé.",
      "Traitez les alertes d’expiration puis archivez ou remplacez le document de façon contrôlée.",
    ],
    workflow: [
      "Brouillon → En attente de validation → Validé → Expirant → Expiré, Remplacé ou Archivé.",
      "Nouvelle version → conservation des versions précédentes et de leur historique.",
    ],
    controls: [
      "Un champ URL libre ne remplace pas le téléversement du fichier.",
      "Les téléchargements exigent permission et contrôle de l’entreprise.",
      "Les notifications d’expiration restent bornées et configurées.",
    ],
    troubleshooting: [
      "Téléversement impossible : vérifiez le type, la taille, le stockage et votre permission.",
      "Objet lié absent : vérifiez qu’il appartient à la même entreprise.",
      "Document expiré toujours actif : utilisez l’action de remplacement ou d’archivage prévue.",
    ],
    relatedModules: [
      { code: "MEDICINES_PRODUCTS", label: "Produits et médicaments", reason: "Relier autorisations et fiches produit." },
      { code: "BATCH_EXPIRY", label: "Lots et péremptions", reason: "Relier certificats, rappels et destructions." },
      { code: "SUPPLIERS_ORDERS", label: "Fournisseurs et commandes", reason: "Relier licences et documents fournisseur." },
      { code: "QUALITY_PHARMACOVIGILANCE", label: "Qualité et pharmacovigilance", reason: "Relier preuves et déclarations qualité." },
    ],
  },

  PHARMACY_REPORTS: {
    title: "Rapports Pharmacy",
    purpose: "Analyser stock, péremptions, ventes, marges, lots, fournisseurs, prescriptions, qualité, retours, pertes et caisse sans double comptage financier.",
    prerequisites: [
      "Permission de consultation des rapports.",
      "Période, site, produit ou lot disponibles pour limiter le périmètre.",
      "Données opérationnelles et financières communes correctement synchronisées.",
    ],
    steps: [
      "Choisissez le rapport spécialisé et la période.",
      "Appliquez les filtres Site, Produit, Lot, Fournisseur ou Statut disponibles.",
      "Consultez les indicateurs et visualisations fondés sur les données réellement enregistrées.",
      "Comparez les périodes ou segments lorsque cette vue est proposée.",
      "Exportez le résultat autorisé pour une analyse détaillée.",
      "Enregistrez la vue si la fonctionnalité est disponible dans le rapport concerné.",
    ],
    workflow: [
      "Filtres → calcul borné → aperçu → export autorisé.",
      "Les rapports réglementaires utilisent les données Pharmacy ; les rapports financiers utilisent les sources communes.",
    ],
    controls: [
      "Une transaction Pharmacy et sa projection financière ne sont jamais additionnées deux fois.",
      "Les données patient sensibles sont exclues ou agrégées.",
      "Les filtres restent limités à l’entreprise active et aux permissions du lecteur.",
    ],
    troubleshooting: [
      "Montant différent d’un rapport Finance : vérifiez la période, la devise, le statut comptabilisé et les allocations.",
      "Rapport vide : contrôlez les filtres et l’existence de données confirmées.",
      "Export absent : votre permission ou le rapport sélectionné ne permet pas l’export.",
    ],
    relatedModules: [
      { code: "STOCK_INVENTORY", label: "Stock et inventaire", reason: "Vérifier les données physiques du stock." },
      { code: "SALES_DISPENSATION", label: "Ventes et dispensation", reason: "Analyser les ventes et produits délivrés." },
      { code: "RETURNS_ADJUSTMENTS_LOSSES", label: "Retours, ajustements et pertes", reason: "Expliquer les écarts et pertes." },
      { code: "FINANCE_STATEMENTS", label: "États financiers", reason: "Consulter les résultats comptables publiables." },
    ],
    limitations: [
      "Un rapport n’active pas une fonctionnalité métier absente et ne corrige pas automatiquement les données source.",
    ],
  },

  PHARMACY_SETTINGS: {
    title: "Paramètres Pharmacy",
    purpose: "Configurer numérotation, FEFO, seuils, alertes, validation pharmacien, produits contrôlés, stockage, température, devise, caisse, documents et qualité.",
    prerequisites: [
      "Permission d’administration Pharmacy.",
      "Comprendre l’impact opérationnel du paramètre avant modification.",
      "Validateur supplémentaire disponible lorsque la politique exige une double approbation.",
    ],
    steps: [
      "Ouvrez la section correspondant au paramètre à modifier.",
      "Lisez l’effet, les modules concernés, les risques et la date d’effet affichés.",
      "Modifiez la valeur et fournissez le motif demandé.",
      "Confirmez l’action sensible ou soumettez-la à double validation lorsque nécessaire.",
      "Vérifiez la date d’effet et l’historique après enregistrement.",
      "Testez le parcours concerné, par exemple FEFO, alerte de péremption ou validation pharmacien.",
    ],
    workflow: [
      "Valeur actuelle → modification préparée → confirmation ou validation → nouvelle valeur à date d’effet.",
      "Paramètre critique refusé ou retourné → ancienne valeur conservée.",
    ],
    controls: [
      "Chaque modification critique conserve l’auteur, le motif, la date d’effet et l’historique.",
      "La désactivation d’un contrôle réglementaire exige permission et confirmation renforcées.",
      "La devise et la caisse réutilisent les configurations communes lorsqu’elles ont un impact financier.",
    ],
    troubleshooting: [
      "Paramètre non modifiable : votre rôle ne possède pas l’administration Pharmacy ou une validation est en attente.",
      "Nouvelle règle non appliquée immédiatement : vérifiez sa date d’effet.",
      "Alerte ou FEFO inattendu : contrôlez les seuils, lots, statuts et règles actives.",
    ],
    relatedModules: [
      { code: "BATCH_EXPIRY", label: "Lots et péremptions", reason: "Vérifier FEFO, péremption, quarantaine et rappel." },
      { code: "ALERTS_EXPIRY_LOW_STOCK", label: "Alertes et rappels", reason: "Vérifier seuils et délais de notification." },
      { code: "SALES_DISPENSATION", label: "Ventes et dispensation", reason: "Vérifier validation pharmacien, remises et contrôles." },
      { code: "CASH_INVOICES_PAYMENTS", label: "Caisse, factures et paiements", reason: "Vérifier les paramètres de caisse communs." },
    ],
  },
};
