# Changelog DTSC Platform

Ce document suit en français professionnel les améliorations apportées à DTSC Platform. Chaque entrée doit préciser ce qui a été ajouté, modifié, corrigé, supprimé ou amélioré afin de conserver une lecture claire de l'évolution du produit.

## 2026-06-13

### Ajouté

- Ajout du module Facturation médicale HEALTH_CARE dédié avec catalogue de prestations, factures patient, lignes persistées, paiements, soldes et historique financier audité.
- Ajout de routes privées Facturation médicale, de calculs transactionnels côté serveur et de contrôles anti-double facturation pour Consultation, Laboratoire et Pharmacie interne.
- Ajout d’un workspace Facturation médicale responsive partagé entre Administration et Activités, avec formulaires guidés, libellés français et infos-bulles.

### Amélioré

- La navigation latérale utilise désormais l’icône métier configurée pour chaque module du socle commun et de chaque secteur, avec un repli cohérent par code et catégorie.

### Ajouté

- Ajout du module Pharmacie interne HEALTH_CARE dédié avec produits, lots, mouvements transactionnels, délivrances patient/consultation, logique FEFO, alertes stock/péremption et historique.
- Ajout des routes privées Pharmacie interne, des permissions métier renforcées et des lectures de délivrances depuis Patients, Consultations et Dossiers médicaux.
- Ajout d’un workspace Pharmacie interne responsive partagé entre Administration et Activités, avec formulaires guidés, libellés français et infos-bulles.

### Sécurisé

- Les sorties de produits sensibles exigent désormais explicitement `health.pharmacy.authorize_sensitive_exit`; le rôle administrateur entreprise ne constitue pas un passe-droit.
- Les lots, patients, consultations, services et prescripteurs sont validés côté serveur dans la même organisation, et les produits sensibles sont masqués dans les vues liées sans permission dédiée.

## 2026-06-12

### Ajouté

- Ajout du module Laboratoire HEALTH_CARE dédié avec catalogue d’examens, demandes multi-examens, prélèvements, saisie et validation des résultats, transmission au médecin et historique.
- Ajout des routes privées Laboratoire et des intégrations réelles avec Patients, Consultations, Dossiers médicaux, Équipe médicale, Administration et Activités.
- Ajout du module Équipe médicale HEALTH_CARE dédié avec affectations liées aux membres actifs, postes, services, spécialités, disponibilités, permissions et historique.
- Ajout des routes privées Équipe médicale pour liste, tableau de bord, affectation, détail, modification, suspension, réactivation, archivage et création de spécialités.
- Ajout d’un workspace Équipe médicale responsive partagé entre Administration et Activités.
- Ajout du module Dossiers médicaux HEALTH_CARE dédié avec dossier principal unique par patient, antécédents, allergies, traitements, alertes, notes confidentielles et historique audité.
- Ajout des routes privées Dossiers médicaux pour la liste, la création, le détail sensible, la mise à jour, l’archivage et les éléments médicaux structurés.
- Ajout d’un workspace Dossiers médicaux responsive partagé entre Administration et Activités, relié aux patients et aux consultations dédiées.
- Ajout du module Consultations HEALTH_CARE dédié avec modèles `HealthConsultation` et `HealthConsultationEvent`, migration additive et reprise non destructive des consultations génériques valides.
- Ajout des routes privées Consultations pour liste, création, détail, modification et transitions historisées de démarrage, attente examens, suivi, clôture, réouverture et annulation.
- Ajout d’un workspace Consultations clinique responsive partagé entre Administration et Activités, avec constantes vitales, IMC, examen, diagnostic, prescription, recommandations et historique.
- Ajout du module Rendez-vous HEALTH_CARE dédié avec modèles `HealthAppointment` et `HealthAppointmentEvent`, migration additive et reprise non destructive des rendez-vous génériques valides.
- Ajout des routes privées Rendez-vous pour liste, planning, création, détail, modification et transitions historisées, dont la conversion idempotente en consultation.
- Ajout d’un workspace Rendez-vous responsive partagé entre Administration et Activités, avec filtres, planning par jour, formulaires guidés, détails et actions métier réelles.

### Amélioré

- Les résultats laboratoire sensibles sont désormais masqués sans permission dédiée et les résultats validés sont verrouillés contre les modifications libres.
- Les comboboxes et validations Rendez-vous et Consultations utilisent désormais uniquement les professionnels Santé actifs et disponibles.
- L’accès aux détails et notes confidentielles des dossiers médicaux dépend désormais des permissions Santé persistées de l’affectation, pas du seul rôle administratif entreprise.
- Une allergie grave ou potentiellement mortelle crée désormais automatiquement une alerte médicale active dans la même transaction.
- Les notes confidentielles des dossiers médicaux sont exclues des réponses non sensibles et réservées aux utilisateurs autorisés.
- Correction du lint Vercel `prefer-const` dans le service Rendez-vous afin de rétablir le déploiement de l’itération Consultations.
- La conversion Rendez-vous crée désormais une consultation dédiée idempotente et relie automatiquement le patient, le professionnel, le service et les informations utiles.
- Les consultations clôturées ou annulées sont verrouillées côté serveur et les données cliniques sont masquées sans accès sensible.
- Les rendez-vous exigent désormais un patient du même tenant et valident aussi le professionnel et le service côté serveur.
- Le tableau de bord Santé expose des KPI réels de confirmation, attente, annulation, absence et conversion.
- Les routes Santé génériques refusent désormais les mutations Rendez-vous afin d’empêcher le contournement des transitions dédiées.

## 2026-06-11

### Ajouté

- Ajout du module Patients HEALTH_CARE dédié avec modèles `HealthPatient` et `HealthPatientEvent`, migration additive et reprise non destructive des patients génériques existants.
- Ajout des routes privées Patients pour la liste filtrée, la création, le détail, la modification, l’archivage logique et les changements de statut audités.
- Ajout d’un workspace Patients premium avec recherche, filtres, pagination, skeleton, formulaire plein écran, détail, historique et liens vers rendez-vous, consultations, documents et dossier médical.
- Ajout du noyau ERP transversal `EnterpriseCoreRecord`, `EnterpriseCoreEvent`, `EnterpriseCoreComment` et `EnterpriseEntityLink`, avec migration additive, isolation par entreprise, historique et liens sectoriels.
- Ajout des routes privées et de l’espace frontend commun pour créer, rechercher, commenter et traiter les tâches, réunions, demandes, validations, documents, rapports, budgets, fournisseurs et achats communs.
- Ajout des modules communs Validations et Notifications métier dans les modèles sectoriels et les organisations clientes existantes.
- Ajout de la documentation `docs/enterprise-core.md` sur le modèle transversal, les permissions, les API et les intégrations sectorielles.
- Ajout de l'espace collaborateur Activités pharmacie avec dix-sept vues opérationnelles, tableau de bord personnalisé, tâches, validations, alertes assignées, documents, workflows et historique.
- Ajout des modèles `PharmacyActivityItem`, `PharmacyActivityComment`, `PharmacyActivityDocument`, `PharmacyActivityEvent` et `PharmacyPharmacistAdviceRequest` avec migration additive.
- Ajout des routes privées Activités pharmacie pour charger le tableau de bord, créer une action reliée à son module métier, commenter, joindre un document, répondre à un avis et traiter le cycle de validation.
- Ajout du centre métier Paramètres pharmacie avec dix-sept sections, profils par organisation, numérotation transactionnelle, historique audité et règles critiques motivées.
- Ajout des modèles `PharmacySetting`, `PharmacyNumberingSequence`, `PharmacySettingsAuditLog` et `PharmacySettingsProfile` avec migration additive.
- Ajout des routes privées permettant de consulter, modifier, réinitialiser, prévisualiser et administrer les paramètres et séquences de numérotation.
- Ajout du module Rapports pharmacie avec quinze vues décisionnelles, indicateurs issus des tables métier réelles, filtres multi-tenant, vues sauvegardées, snapshots et exports CSV audités.
- Ajout des modèles `PharmacySavedReportView`, `PharmacyReportExport` et `PharmacyReportSnapshot` avec migration additive.
- Ajout des routes privées de reporting, sauvegarde de vue, snapshot et export CSV avec protection financière et sensible côté serveur.
- Ajout du module dédié Pharmacie > Documents & conformité avec quinze vues, bibliothèque privée, classification, liens métier, conformité, expiration, documents manquants, confidentialité, versioning et audit des téléchargements sensibles.
- Ajout des modèles `PharmacyDocument`, `PharmacyDocumentLink`, `PharmacyDocumentVersion`, `PharmacyDocumentAccessLog`, `PharmacyDocumentComplianceRule`, `PharmacyMissingDocument` et de la migration additive associée.
- Ajout des routes privées de création avec fichier sécurisé, traitement documentaire, détection conformité et téléchargement contrôlé.
- Ajout du module dédié Pharmacie > Incidents qualité & pharmacovigilance avec quatorze vues, registre structuré, investigations, CAPA, effets indésirables, plaintes, actions lots et audit.
- Ajout des modèles `PharmacyQualityIncident`, `PharmacyQualityInvestigation`, `PharmacyQualityCapaAction`, `PharmacyAdverseReactionReport`, `PharmacyCustomerComplaint`, `PharmacyQualityDocument`, `PharmacyQualityEvent` et de la migration additive associée.
- Ajout des routes privées permettant de créer, consulter et traiter les incidents qualité, leurs suivis et leurs escalades.
- Ajout du moteur persistant Pharmacie > Alertes stock / péremption / rappel avec détection multi-modules, déduplication, cycle de vie, assignation, notifications critiques et historique.
- Ajout des modèles `PharmacyAlert`, `PharmacyAlertEvent`, `PharmacyAlertRule`, `PharmacyAlertSetting` et de la migration additive associée.
- Ajout des routes privées de consultation, détection, traitement, gestion des règles et paramètres d'alertes.
- Ajout du module Pharmacie > Retours, ajustements & pertes avec douze vues métier, déclarations, validations, alertes, justificatifs et historique des mouvements.
- Ajout des modèles et de la migration additive `PharmacyReturnLossEvent`, `PharmacyReturnLossDocument` et `PharmacyReturnLossAlert`.
- Ajout des routes privées permettant de créer, soumettre, valider, rejeter, annuler et résoudre les alertes du module.

### Amélioré

- Les données médicales de base des patients sont désormais masquées côté API et interface pour les lecteurs sans accès sensible ; les mutations génériques Santé refusent désormais de contourner le module Patients dédié.
- Le miroir de compatibilité Patient ne conserve plus les données médicales sensibles ; la migration les reprend dans la table dédiée avant de nettoyer les anciennes clés génériques.
- Les permissions Patients recommandées sont fusionnées sans perte dans les postes Santé officiels, et les nouveaux patients conservent une référence compatible avec les modules Santé existants.
- Le tableau de bord Administration entreprise affiche désormais des compteurs réels de tâches ouvertes ou en retard, validations en attente, documents récents, budgets actifs et fournisseurs actifs.
- Les demandes créées dans Activités entreprise et les activités PHARMACY génèrent désormais un objet commun lié, sans remplacer leur source métier spécialisée.
- Les membres voient uniquement les objets communs qui les concernent, les responsables disposent d’une vue entreprise, et les invités restent limités à la lecture.
- Les collaborateurs PHARMACY disposent désormais d'une interface mobile orientée action, avec libellés français, aides contextuelles, combobox multi-tenant et menus d'actions persistées.
- Les demandes de réapprovisionnement, ruptures, péremptions, inventaires, ajustements, rapports caisse, anomalies de vente, incidents qualité et avis pharmacien alimentent directement les modèles métier concernés sans contourner leurs validations sensibles.
- Les paramètres pharmacie pilotent désormais réellement les ventes, lots, réceptions, caisse, documents, qualité, alertes et exports sensibles côté serveur.
- Les numéros de ventes, réceptions, sessions caisse, paiements, factures, reçus, remboursements et incidents qualité sont générés par séquences atomiques propres à chaque organisation.
- Les ventes annulées sont exclues des ventes nettes, les encaissements proviennent des paiements réels et le stock est valorisé depuis les lots sans exposer les montants aux utilisateurs non autorisés.
- Les documents spécialisés existants sont désormais agrégés dans les métriques du référentiel sans duplication ni suppression.
- Les expirations, renouvellements et documents obligatoires manquants sont détectés depuis des règles actives et des objets réels, avec alertes dédupliquées.
- Les incidents qualité appliquent désormais les règles fortes de criticité, d'action immédiate, d'investigation obligatoire, de CAPA et de clôture, avec références strictement filtrées par organisation.
- Les actions de quarantaine et de blocage de lot depuis un incident sont explicites, motivées, historisées et ne modifient jamais les quantités.
- Le module Alertes fournit désormais quatorze vues fonctionnelles, des cartes mobiles, des libellés français, des aides contextuelles et des actions persistées.
- Les détecteurs consolident les ruptures, stocks faibles, surstocks, prix/lots manquants, péremptions, rappels, quarantaines, commandes, réceptions, ventes, inventaires, ajustements, pertes, destructions et caisse.
- Les retours clients et fournisseurs, ajustements, pertes, casses, retraits, rappels et destructions appliquent désormais des mouvements stock transactionnels, idempotents et réversibles.
- Toutes les références liées sont vérifiées dans l'organisation PHARMACY active; l'interface fournit des libellés métier français, aides contextuelles et formulaires mobiles bornés.

### Corrigé

- Correction de l'apostrophe JSX non échappée dans le formulaire Ventes & dispensation qui bloquait ESLint lors du déploiement Vercel.
- Correction du contrat TypeScript des options de remboursement du module Retours, ajustements & pertes afin de permettre le filtrage par vente pendant le build Vercel.
- Typage explicite des collections COO de la page Activités afin d'éviter les paramètres de callback implicitement `any` pendant le contrôle TypeScript Vercel.

## 2026-06-10

### Ajouté

- Ajout du module dédié Pharmacie > Fournisseurs & commandes avec référentiel fournisseurs, produits associés, demandes de réapprovisionnement, commandes multi-lignes, suivi livraison, documents et alertes réelles.
- Ajout des modèles et de la migration additive `PharmacySupplier`, `PharmacySupplierProduct`, `PharmacyReplenishmentRequest`, `PharmacyPurchaseOrder`, `PharmacyPurchaseOrderLine`, `PharmacySupplierDocument` et `PharmacyPurchaseAlert`.
- Ajout des routes privées achats pour créer les référentiels, gérer les transitions de validation et préparer une réception brouillon depuis une commande.
- Ajout du module dédié Pharmacie > Ordonnances / prescriptions avec réception structurée, lignes prescrites référencées ou libres, rapprochement produits, substitution générique traçable, contrôle pharmacien, dispensation, documents et audit.
- Ajout des modèles et de la migration additive `PharmacyPrescription`, `PharmacyPrescriptionLine`, `PharmacyPrescriptionDocument` et `PharmacyPrescriptionAuditEvent`.
- Ajout des routes privées de création, consultation, soumission, validation, rejet, demande d'information, rapprochement, substitution, indisponibilité, dispensation, archivage et génération de vente brouillon.
- Ajout du module dédié Pharmacie > Sorties, ventes & dispensation avec panier multi-produit, lots vendables FEFO, validation pharmacien, paiements, annulations, remboursements, anomalies et mouvements de stock.
- Ajout des modèles et de la migration additive `PharmacySale`, `PharmacySaleLine`, `PharmacySaleRefund`, `PharmacySaleRefundLine` et `PharmacySaleAnomaly`.
- Ajout des routes privées de création, consultation, confirmation, validation pharmacien, annulation et remboursement des ventes.
- Ajout du module dédié Pharmacie > Entrées stock / réceptions avec tableau de bord, réceptions fournisseurs, lignes, réceptions partielles, écarts, documents et historique.
- Ajout des modèles et de la migration additive `PharmacyReceipt`, `PharmacyReceiptLine`, `PharmacyReceiptBatch`, `PharmacyReceiptDiscrepancy` et `PharmacyReceiptDocument`.
- Ajout des routes privées de création, modification de brouillon, soumission, validation, rejet, annulation et traitement des écarts de réception.

### Amélioré

- Les lots et réceptions consomment désormais les fournisseurs et commandes dédiés de la pharmacie; la validation et l'annulation d'une réception synchronisent les quantités reçues et restantes de la commande.
- Le module achats fournit onze vues responsives, des libellés métier français, des aides contextuelles et des formulaires plein écran sans faux téléversement.
- Les ventes utilisent désormais les ordonnances dédiées de la même organisation et une ordonnance validée peut générer une vente brouillon préremplie selon FEFO sans impacter le stock.
- L'espace Ordonnances fournit onze vues métier responsives, des cartes mobiles, des libellés français, des aides contextuelles et un formulaire plein écran.
- Les ventes contrôlent les produits, lots, ordonnances, collaborateurs et départements dans la même organisation avant d'appliquer une sortie stock transactionnelle et idempotente.
- Les formulaires de vente affichent des libellés commerciaux français, des aides contextuelles et des conteneurs mobiles bornés.
- La validation d'une réception crée ou alimente les lots, augmente réellement le stock, crée les mouvements `RECEIPT` et met à jour les commandes fournisseurs liées.
- Les réceptions partielles, écarts automatiques de quantité, combobox multi-tenant et formulaires plein écran mobiles remplacent l'ancien formulaire générique.
- Les formulaires Lots utilisent désormais les réceptions dédiées comme référentiel.

### Corrigé

- Correction du build Vercel des infos-bulles de vente en portant le titre accessible sur un conteneur HTML compatible plutôt que sur l'icône Lucide.
- Correction du build Vercel des remboursements de vente en conservant le narrowing TypeScript du montant et du motif avant la transaction Prisma.
- Correction du build Vercel en supprimant la clé `QUARANTINE` dupliquée dans les libellés Stock & inventaire.

## 2026-06-09

### Ajouté

- Ajout du module dédié Pharmacie > Stock & inventaire avec agrégats stock réels, mouvements consultables, sessions et lignes d'inventaire, écarts, ajustements, emplacements et alertes calculées.
- Ajout des tables `PharmacyInventorySession`, `PharmacyInventoryLine`, `PharmacyStockAdjustment` et `PharmacyStockLocation`, avec enrichissement non destructif des mouvements de stock.
- Ajout de la route privée `/api/enterprise/[organizationId]/pharmacy/stock` pour charger le stock et exécuter les opérations sensibles isolées par organisation.
- Ajout du module dédié Pharmacie > Lots & péremptions avec tables `PharmacyBatch` et `PharmacyStockMovement`, migration additive des anciens lots et mouvement initial traçable.
- Ajout des routes lots isolées par organisation pour la liste, la création, le détail, la modification, la quarantaine, la levée de quarantaine, le rappel, le blocage, l'annulation et la sélection FEFO.
- Ajout d'une interface Lots responsive avec recherche, filtres, badges de sécurité, formulaire plein écran, détail, mouvements et actions métier persistées avec motif.
- Ajout du catalogue dédié `PharmacyProduct` pour le module Pharmacie > Produits & médicaments, avec migration additive des anciens produits génériques.
- Ajout des routes privées produits pour la recherche, la création, la consultation, la modification, l'archivage logique et la réactivation.
- Ajout d'une interface catalogue responsive avec recherche, filtres, pagination, fiche produit et formulaire métier structuré.

### Amélioré

- Les formulaires Stock & inventaire affichent désormais des libellés métier français, des listes commerciales traduites et une info-bulle d'orientation sur chaque champ.
- Les filtres Produits & médicaments traduisent aussi les règles et critères de tri afin de ne plus exposer de clés techniques.
- Le sous-module Stock & inventaire remplace son formulaire générique par dix sous-vues fonctionnelles, des cartes mobiles, des formulaires plein écran et des actions historisées.
- La navigation latérale des entreprises clientes et le panneau générique des modules affichent uniquement le socle commun; les modules sectoriels restent regroupés dans leurs sous-modules Administration dédiés.
- Les pages du socle commun remplacent l'espace générique superficiel par des indicateurs et listes issus des collaborateurs, départements, postes, workflows, demandes, réunions et audits réels de l'entreprise.
- Les lots, ventes, réceptions et Activités Pharmacie utilisent désormais le catalogue produit central dans leurs sélections.
- Les catégories, formes, unités, voies d'administration, conditions de conservation, statuts et devises utilisent des listes contrôlées partagées.
- Les champs, options, filtres et détails du formulaire Produits & médicaments affichent des libellés métier en français et des infos-bulles d'orientation, sans exposer les noms techniques internes.
- La QA de régression contrôle désormais la présence des libellés métier et aides contextuelles du catalogue Produits.

### Sécurisé

- Les comptages, ajustements, emplacements, sessions et références produit/lot/département/collaborateur sont validés côté serveur dans le tenant actif; un ajustement ne peut jamais rendre le stock négatif.
- Les lots refusent les produits, fournisseurs, commandes, réceptions et collaborateurs d'une autre organisation; les actions sensibles réappliquent les permissions backend et l'audit.
- Les lots expirés, rappelés, bloqués ou en quarantaine sont exclus de la sélection FEFO et ne sont plus vendables via les impacts stock existants.
- Les opérations produit vérifient session, organisation PHARMACY active, membership, module autorisé, origine, rate limit, validation Zod, unicité par organisation et droits d'action.
- L'archivage produit est non destructif et chaque mutation importante est auditée.

### Corrigé

- Correction des débordements mobiles des formulaires Stock, des filtres Produits & médicaments et du sélecteur d'entreprise sur la page de connexion.
- Correction des comparaisons impossibles entre dates/nombres déjà normalisés par Zod et chaînes vides, afin de rétablir le contrôle TypeScript du build Vercel.
- Normalisation explicite en nombres des calculs de quantités, températures et coût total des lots pour éviter les unions Zod non arithmétiques pendant le build Vercel.
- Correction du build Vercel du catalogue Produits & médicaments en remplaçant deux constantes utilisées uniquement comme types, refusées par `@typescript-eslint/no-unused-vars`.
- Correction du typage Prisma à la création d'un produit en séparant la normalisation des champs texte et numériques optionnels.
- Correction du retour de normalisation numérique afin qu'il soit strictement compatible avec les champs Prisma `number | null`.
- Suppression de l'ancien contrôle de doublon produit devenu inatteignable dans l'API pharmacie générique depuis l'activation du catalogue dédié.

## 2026-06-07

### Ajouté

- Ajout du CRUD complet des messages Support dans les menus `...`: réponse ciblée, copie, modification et suppression logique auditée.
- Ajout des réponses persistées aux commentaires opérationnels `CooComment`, avec aperçu cliquable du commentaire source, chargement progressif et mise en évidence de la cible.
- Alignement des commentaires de publications publiques: une réponse affiche maintenant un aperçu cliquable qui recentre et met en évidence le commentaire source.
- Ajout de la route privée `/enterprise-modules/[moduleCode]`, qui fournit une page dédiée aux modules activés d'une entreprise et réunit leurs blocs opérationnels et données sectorielles autorisées.
- Ajout d'une migration Prisma additive pour `TicketMessage.replyToId`, `TicketMessage.updatedAt`, `TicketMessage.deletedAt`, `CooComment.replyToId` et `CooComment.deletedAt`.

### Amélioré

- Les discussions Support chargent uniquement les messages récents, restent bornées et scrollables, puis permettent de charger les échanges précédents par curseur.
- La navigation desktop et mobile des entreprises affiche dynamiquement les modules réellement activés et inclus dans l'abonnement; les modules sectoriels proviennent uniquement du modèle appliqué à l'entreprise.
- Le menu d'actions partagé est maintenant rendu dans un portail au niveau du document avec un premier plan global, ce qui évite son masquage par les conteneurs scrollables ou les cartes.
- Le contexte système du chatbot distingue désormais la navigation entreprise active et le Support conversationnel paginé des fonctionnalités non activées.

### Sécurisé

- Les mutations de messages Support et de commentaires opérationnels vérifient session, accès à l'objet, origine, validation Zod, rate limiting et propriété ou rôle administrateur avant modification.
- Les suppressions de messages et commentaires sont non destructives afin de préserver les réponses, la chronologie et les audits.
- L'accès à une page de module entreprise réapplique côté serveur l'appartenance, l'activation du module et les entitlements du plan.

## 2026-06-06

### Ajouté

- Transformation de `/admin` > `Abonnements & facturation` en centre de contrôle SaaS par entreprise: indicateurs d'exploitation, recherche, création, modification, activation, essai, retard de paiement, suspension, renouvellement avec historique, expiration et annulation métier.
- Ajout des routes DTSC internes `POST /api/admin/organization-subscriptions` et `PATCH /api/admin/organization-subscriptions/[id]`, protégées par session, contexte interne, rôle autorisé, origine, validation Zod, rate limiting, `ApiLog` et `AuditLog`.
- Ajout d'une vue d'historique des abonnements et de motifs obligatoires pour chaque opération sensible.
- Ajout dans `/admin` > `Abonnements & facturation` d'un gestionnaire professionnel des plans et tarifs: prix USD, nom commercial, description, quotas chatbot, ordre et activation.
- Ajout de `PATCH /api/admin/billing-plans/[id]`, réservé au rôle `ADMIN`, avec origine, Zod, rate limit, `ApiLog` et audit avant/après.

### Amélioré

- Le dataset facturation de la Console couvre désormais toutes les entreprises clientes, y compris celles sans abonnement, et fournit les plans actifs ainsi que les KPI d'abonnements et le MRR estimé.
- La QA source-level contrôle désormais les protections backend et les opérations du centre de contrôle des abonnements.
- `ensureBillingPlans()` crée uniquement les plans absents avec `createMany(..., skipDuplicates: true)` et ne réécrit plus les tarifs ou quotas administrés.

### Corrigé

- Correction du build Vercel du centre de contrôle: le fallback de limites utilise désormais le plan SaaS minimal typé `STARTER` au lieu de la valeur invalide `FREE`.

### Sécurisé

- La suppression d'un abonnement est traitée comme une annulation métier auditée; aucun abonnement, paiement ou historique n'est supprimé physiquement.
- Le renouvellement clôture l'abonnement courant et crée une nouvelle période afin de préserver la traçabilité.

## 2026-06-05

### Ajouté

- Ajout d'une couche SaaS centralisee pour les organisations clientes: plans `STARTER`, `BUSINESS`, `ENTERPRISE`, limites d'usage, entitlements de modules et helpers `getOrganizationEntitlements`, `canUseModule`, `canUseFeature`, `assertCanUseModule`, `getOrganizationUsageLimits` et `isSubscriptionActive`.
- Ajout de `docs/SAAS_PLANS_AND_ENTITLEMENTS.md`, reference technique des plans, limites, modules controles, comportements d'acces, Console DTSC et QA associee.
- Ajout de contenus commerciaux publics approfondis pour Accueil, Services, Solutions, Secteurs, Projets, À propos, Ressources, Contact, Data en Afrique, BI & KPI et IA en entreprise: blocs problème client, action DTSC, livrables, résultats mesurables, FAQ, parcours de méthode et liens internes.
- Ajout sur la page Contact d'une qualification par besoin client et par levier DTSC, avec mini-parcours de cadrage sans modifier le formulaire serveur existant.
- Ajout sur la page Ressources de catégories éditoriales, d'une lecture par objectif et d'un état vide orienté visiteur.
- Ajout de `docs/QA_REGRESSION_CHECKLIST.md`, checklist QA globale couvrant sous-domaines, auth, Console DTSC, Support, modules Entreprise, groupes, appels, notifications, calendrier, UX mobile et accès interdits entre organisations.
- Ajout de `pnpm qa:regression` via `scripts/qa-regression-checks.mjs`, suite source-level sans dépendance externe pour vérifier les garde-fous critiques multi-tenant avant build Vercel.

### Amélioré

- La Console DTSC `Abonnements & facturation` affiche maintenant les abonnements organisations avec plan resolu, statut, dates, limites, modules, utilisateurs actifs, dernier paiement et audit des paiements.
- La page client `/billing` expose en lecture seule le plan de l'organisation active, son statut, ses limites, les modules disponibles et les enregistrements de facturation organisationnels recents.
- `AGENTS.md` impose maintenant la vérification de `pnpm qa:regression` avant commit/push et le maintien de `docs/QA_REGRESSION_CHECKLIST.md` avant push quand les parcours ou règles QA changent.
- Les pages publiques corporate utilisent désormais un modèle de contenu enrichi et réutilisable pour afficher problèmes, livrables, bénéfices, exemples, FAQ, parcours et CTA sans créer de route ni action placeholder.
- Les pages pédagogiques publiques disposent de hero images thématiques, FAQ dédiées et liens internes vers Services, Solutions, Projets, Contact, Data en Afrique, BI & KPI et IA en entreprise.
- Stabilisation des appels audio/vidéo dans `Mes collaborateurs`: durée d'appel visible à partir de `startedAt`, reprise correcte dans un appel actif, messages humains côté interface et distinction claire entre `Quitter` et `Terminer`.
- La notification flottante globale des appels ouvre désormais directement le groupe et l'appel concernés via `/collaborators?groupId=...&joinCall=...`, avec respect des préférences utilisateur d'alertes, de sons et d'affichage.
- Les boutons micro/caméra pilotent maintenant les pistes média réelles et synchronisent l'état participant côté serveur afin d'alimenter les événements `PARTICIPANT_MUTED` et `PARTICIPANT_UNMUTED`.
- Documentation README et technique complétée avec le flux de validation QA globale, les profils de test et les limites de la suite source-level.

### Sécurisé

- Les modules `Administration [Entreprise]`, `Activites [Entreprise]`, calendrier interne, collaboration et appels collaboratifs sont controles cote serveur par plan, abonnement actif, statut organisation et modules actives.
- Les donnees sectorielles sante ne sont plus chargees si le module cible n'est pas autorise par le plan et les entitlements de l'organisation.
- Les routes mutantes de gestion des organisations clientes exigent maintenant le contexte `DTSC_INTERNAL`, une origine valide, un rate limit et une validation Zod.
- Le checkout facturation applique maintenant controle d'origine, rate limit et validation JSON robuste avant toute creation d'abonnement ou tentative MaishaPay.
- Durcissement complémentaire des routes Support `PATCH /api/support/tickets/[id]` et `POST /api/support/tickets/[id]/messages`: contrôle d'origine, rate limiting, validation JSON robuste, journalisation API et notifications non bloquantes.
- Ajout de routes protégées pour les événements d'appel et l'état média participant: contrôle d'origine, session, membership de groupe, validation Zod, rate limiting, audit de groupe et journalisation API.
- Les réponses de liste d'appels ne renvoient plus les détails techniques internes de salle ou de fournisseur; les messages visibles restent orientés utilisateur.
- La notification de démarrage d'appel est non bloquante afin qu'un effet secondaire de notification ne transforme pas un appel déjà créé en erreur utilisateur.

## 2026-06-04

### Modifié

- Refactorisation de `Activités [Entreprise]`: les loaders serveur sont extraits dans `lib/enterprise/*`, la page `/enterprise-activities` redevient un orchestrateur auth/contexte/membership/dataset/rendu, et les types sérialisables sont centralisés dans `lib/enterprise/enterprise-activities-types.ts`.
- Découpage de l'interface Activités [Entreprise] en panels maintenables: dashboard, blocs d'activités, demandes, workflows, repères santé et dialogue de création responsive.
- Préservation du secteur Santé dans Activités [Entreprise]: les données patients, rendez-vous, consultations, laboratoire, pharmacie, facturation, assurance, confidentialité et rapports ne sont chargées que pour les organisations `HEALTH_CARE`.
- Durcissement de `POST /api/enterprise/[organizationId]/activities` avec contrôle d'origine, rate limiting, validation du destinataire actif de l'entreprise et notifications non bloquantes après persistance.
- Les notifications des créations, modifications et incidents critiques Santé sont non bloquantes afin qu'un effet secondaire de notification ne fasse pas échouer une écriture déjà validée.
- Correction du build Vercel après le refactor Administration [Entreprise]: le loader `getEnterpriseAdministrationDataset()` sérialise maintenant explicitement ses données Prisma en `EnterpriseAdminDataset` JSON afin d'éviter l'incompatibilité TypeScript entre `Date` Prisma et chaînes côté client.
- Refactorisation de `Administration [Entreprise]`: les loaders serveur sont extraits dans `lib/enterprise/*`, la page `/enterprise-admin` redevient un orchestrateur auth/contexte/rendu, et les types sérialisables sont partagés dans `lib/enterprise/enterprise-admin-types.ts`.
- Découpage de l'interface Administration [Entreprise] en panels maintenables: dashboard, membres, modules, départements, postes, workflows, calendrier, paramètres et section santé dédiée.
- Optimisation du chargement Santé: les enregistrements `EnterpriseSectorRecord` ne sont chargés par la page Administration que pour les organisations `HEALTH_CARE`, sans modifier les sous-modules patients, rendez-vous, consultations, laboratoire, pharmacie, facturation, assurance, confidentialité ni rapports.
- Durcissement des routes mutantes Administration [Entreprise], modules, membres et santé avec contrôle d'origine et rate limiting, en conservant les validations `organizationId`, membership actif, rôle entreprise et module activé.
- Navigation produit DTSC encapsulée dans un bouton menu avec liste verticale scrollable: Site public, SaaS, Console DTSC, Support et Compte ne prennent plus d'espace permanent dans la barre latérale desktop.
- Le tableau Administration des utilisateurs garde un scroll horizontal et propose des colonnes redimensionnables manuellement, y compris au clavier, pour lire les emails, rôles, statuts et limites sans repli vertical illisible.
- Correction de la visibilité des groupes `Mes collaborateurs` hors contexte organisation: les groupes globaux standards dont l'utilisateur est membre ne sont plus masqués par le filtre réservé aux groupes transversaux.
- La création de groupe collaboratif applique désormais un rate limiting, un contrôle d'origine et une notification non bloquante afin qu'une erreur de notification ne fasse pas échouer la réponse après persistance.

## 2026-06-02

### Modifié

- Correction de la création des tickets Support: la route `POST /api/support/tickets` valide désormais l'origine, applique un rate limiting, ignore les contextes organisation obsolètes au lieu de bloquer la persistance et ne fait plus échouer la réponse de création si la notification DTSC rencontre une erreur.
- Le formulaire Support conserve la référence du formulaire avant l'appel réseau et gère les erreurs `fetch` afin d'éviter un état d'envoi bloqué après soumission.
- Refactorisation de la Console DTSC: les chargements de données de `/admin` sont extraits dans `lib/console/*` par domaine fonctionnel afin de garder la page App Router comme orchestrateur d'authentification, de section active et de rendu.
- Les règles Support corrigées sont conservées pendant le refactor: l'historique utilisateur reste basé sur `SupportTicket.userId`, tandis que `organizationId` demeure un contexte de triage et d'analyse.
- Correction responsive mobile des cartes et formulaires récents: Console DTSC, journaux d'audit, KPI, support, calendrier interne, dialogues et champs partagés restent désormais bornés à la largeur de l'écran avec retour à la ligne des libellés longs.
- Transformation progressive de `/admin` en Console DTSC SaaS avec vue générale de pilotage: entreprises clientes actives, abonnements, tickets ouverts/critiques, utilisateurs actifs, modules activés, incidents API, audits sensibles et événements sécurité récents.
- Extension du `Calendrier interne`: CRUD complet des disponibilités collaborateurs, plages sur date précise ou fréquence quotidienne/hebdomadaire/mensuelle, suppression logique auditée et visibilité des disponibilités DTSC ouverte au rôle `SUPPORT`.
- Correction de la visibilité du module `Mes collaborateurs` en contexte entreprise cliente: le lien reste affiché dans tous les contextes authentifiés et la lecture des groupes repose sur le membership actif et le contexte autorisé, plus sur l'abonnement actif de l'organisation.
- Réorganisation des libellés de sections Console autour de Vue générale, Entreprises clientes, Abonnements & facturation, Support client, Publications & contenus, Utilisateurs & accès, Sécurité & audit, Modules internes DTSC et Paramètres plateforme.
- Correction du module Support: l'historique des tickets d'un utilisateur est à nouveau visible indépendamment du contexte actif, tout en conservant `organizationId` comme contexte de triage et l'isolation stricte par `userId`.
- La création d'un ticket support déclenche désormais un rafraîchissement serveur de la liste afin que le ticket apparaisse immédiatement après persistance.
- Correction du build Vercel sur la navigation privée: les items `NavLinks` sont typés explicitement pour éviter qu'un chemin actif soit inféré en `unknown` pendant le contrôle TypeScript.
- Stabilisation de la couche multi-sous-domaines: redirections post-login centralisées, `next` interne validé, déconnexion ramenée vers Account et navigation inter-produits Console DTSC, SaaS, Support, Compte et Site public.
- La Console DTSC protège strictement `/admin` pour les sessions `DTSC_INTERNAL`, tout en redirigeant les chemins SaaS et Support vers leurs sous-domaines dédiés afin de conserver une navigation SSO fluide.
- Les liens critiques du shell, de la navigation desktop/mobile, du dashboard, du support, de l'administration et des pages Account utilisent les helpers de `lib/domains.ts` quand ils traversent un produit.
- Ajout de `docs/SUBDOMAIN_QA_CHECKLIST.md` et enrichissement de la documentation Vercel pour les domaines, variables d'environnement, ordre de test et rollback sans extraction monorepo.
- Harmonisation des contenus publics DTSC autour des 7 leviers numériques officiels: Data & BI, Intelligence artificielle, Solutions digitales, Audit & optimisation, Formations, Marketing digital et Imprimerie numérique.
- Les pages Accueil, Services, Solutions, Secteurs, Projets, À propos, Contact, Ressources et les metadata SEO présentent désormais les solutions, secteurs et démonstrations comme des exemples ou cas d'application des 7 leviers, sans créer de liste concurrente de services.
- Alignement de l'index de recherche publique, du contexte de l'assistant IA public, du prompt DTSC et des textes newsletter pour rattacher chatbot, dashboards, ERP, CRM, portails clients, assistant documentaire, reporting et workflows numériques aux leviers correspondants.
- Mise à jour de la page `/offline`, du fallback `public/offline.html` et du cache service worker pour conserver les 7 leviers DTSC hors connexion.

## 2026-05-30

### Ajouté

- Préparation de DTSC Platform à une séparation logique par sous-domaines dans le même projet Vercel: site public, espace SaaS, console DTSC, compte/authentification et support.
- Ajout de `lib/domains.ts` pour centraliser les URLs produit, détecter le type de host courant, construire les liens cross-subdomain et éviter les liens critiques hardcodés.
- Ajout de la documentation `docs/ROUTING_AND_SUBDOMAINS.md` avec matrice de routage, variables d'environnement, fonctionnement du cookie partagé, limites connues et trajectoire future vers monorepo.

### Modifié

- Renommage du package npm en `dtsc-platform`.
- Le middleware détecte les hosts publics, app, console, account et support, puis applique des redirections légères sans déplacer les routes App Router existantes.
- Les liens critiques de connexion, inscription, déconnexion, navigation publique et branding produit utilisent progressivement les helpers de domaines.
- Le shell privé affiche le contexte produit actif avec un branding discret sur desktop et mobile.

### Sécurisé

- Le cookie `dtsc_session` peut recevoir `AUTH_COOKIE_DOMAIN` en production pour être partagé entre sous-domaines officiels tout en conservant `httpOnly`, `sameSite=lax`, `secure` et le format de session existant.
- La console `console.dtsc-platform.com` reste réservée aux sessions `DTSC_INTERNAL`; un client ou membre d'entreprise non autorisé est redirigé vers l'espace SaaS.
- Les routes `/api/*`, assets, service worker, pages offline et fichiers publics sont exclus du routage par host afin de ne pas casser les API, la PWA ni les intégrations existantes.

### Documentation

- Mise à jour de `README.md`, `docs/TECHNICAL_DOCUMENTATION.md`, `docs/CHANGELOG.md`, `env.example`, de la politique de confidentialité et de la politique des cookies pour expliquer la préparation multi-sous-domaines et le cookie de session optionnel partagé.

## 2026-05-29

### Corrigé

- Le module `Calendrier interne` est à nouveau disponible en contexte entreprise cliente: la page, les routes `/api/calendar*`, les disponibilités et les événements utilisent maintenant le `organizationId` actif au lieu de rester réservés au seul tenant DTSC.
- `Administration [Entreprise]` affiche une vue `Calendrier interne` avec les événements planifiés de l'organisation et un accès direct au calendrier, sans exposer les événements d'une autre entreprise.
- Les groupes `Mes collaborateurs` proposent explicitement les types transversaux `CROSS_ORGANIZATION` et `PRIVATE_NETWORK`, avec invitation et acceptation obligatoires pour les utilisateurs recherchés sur toute la plateforme.
- Correction du build Vercel des checkboxes de participants `Activités DTSC`: le rendu n'accède plus à un champ `email` absent du type `CollaboratorOption`.
- Les sélecteurs multi-collaborateurs des réunions, workflows COO, formulaires Activités DTSC et workflows entreprise utilisent désormais des listes à cases à cocher au lieu de demander Ctrl/Cmd + clic.
- Les blocs `Activités DTSC` qui disposent d'une action de création affichent leur bouton dès l'ouverture du bloc, même si aucune donnée n'existe encore.
- Le sélecteur d'espace actif reste visible et utilisable sur mobile grâce à une largeur minimale, un style contrasté et un comportement horizontal stable.
- Dans `Administration > MPO > Portefeuille de projets`, `Documents associés` devient une zone d'import fichier privée avec contrainte de taille, aperçu et téléchargement du fichier déjà stocké; les champs médicaux n'apparaissent qu'après activation explicite du projet médical.
- Les champs `Catégorie` des registres MPO/CTO et des référentiels SCO principaux passent en combobox contrôlées afin de réduire les saisies libres non structurées.
- Les dialogues de formulaires hauts utilisent désormais un vrai comportement plein écran desktop/mobile: en-tête de fermeture toujours visible, hauteur utile du viewport, fermeture par bouton, Échap ou clic sur le fond, afin d'éviter les formulaires enfermés dans une zone scrollable trop courte.
- Standardisation complémentaire des formulaires `Profil et activités entreprise`, `Disponibilité`, `Informations du compte`, `Modifier le profil`, sections de paramètres privées et sous-formulaires `Administration [Entreprise]`: les saisies longues passent par des dialogues hauts `92dvh` avec étiquettes/aides visibles quand le formulaire était encore inline.
- Les formulaires ciblés des modules Entreprise, Support, Paramètres, Activités DTSC, Administration DTSC et Activités [Entreprise] s'ouvrent désormais dans des dialogues hauts responsive avec scroll interne, au lieu de rester prisonniers de cartes ou de blocs trop courts.
- Ajout d'étiquettes et d'aides contextuelles sur les champs des formulaires ciblés: activités professionnelles, création de ticket support, identité professionnelle, création de compte utilisateur, création/modification d'entreprise cliente, gestion d'abonnement, demandes/blocages/rapports DTSC et demandes d'activités entreprise.
- Affinage du secteur `HEALTH_CARE`: formulaires santé restructurés sans répétition inutile, combobox alimentées par patients/rendez-vous/consultations/collaborateurs/départements/postes de l'organisation, et validation backend des références par `organizationId`.
- Réorganisation de `Administration [Entreprise]`: modules filtrés par socle commun et template santé, retrait du bloc technique `Blocs Activités entreprise`, séparation collaborateurs/invitations/postes/permissions/départements/workflows/paramètres.
- Les invitations collaborateurs entreprise ne créent plus un membre actif immédiatement: elles restent en statut `INVITED`, évitent les doublons et notifient l'utilisateur existant.
- `Activités [Entreprise]` utilise des formulaires santé spécifiques avec destinataire obligatoire et métadonnées persistées, et affiche les workflows partagés.
- Correction du build Vercel sur les workflows entreprise: les étapes optionnelles sont normalisées avant découpage pour satisfaire TypeScript strict.

### Sécurisé

- Ajout de `organizationId` sur `InternalCalendarEvent` et `CollaboratorAvailability`, avec migration de backfill vers l'organisation interne DTSC et index dédiés au filtrage par entreprise.
- Les participants et propriétaires du calendrier sont validés côté backend contre les membres actifs de l'organisation active; un membre d'une entreprise ne peut plus cibler un collaborateur DTSC ou une autre entreprise via le calendrier.
- Renforcement de l'isolation en contexte entreprise: `Dashboard`, `Chatbot`, `Entreprise`, `Documents`, `Paramètres`, `Notifications`, `Support` et `Mes collaborateurs` restent visibles, mais leurs données historiques sont maintenant filtrées par `organizationId` quand l'utilisateur travaille dans une entreprise.
- Les badges et alertes de notifications du shell sont filtrés par contexte actif afin de ne pas mélanger les notifications globales, DTSC internes et entreprise.
- Les routes santé refusent désormais les références patient, rendez-vous, consultation, département ou poste qui ne sont pas dans la même entreprise.
- Les paramètres généraux et santé sont persistés sur `Organization.settingsJson` / `brandingJson` avec audit, au lieu de rester des champs décoratifs côté interface.
- Les sous-modules santé désactivés sont vérifiés avec leur code réel côté API afin d'empêcher l'accès backend à un sous-module masqué.

### Ajouté

- Ajout de la première itération sectorielle concrète pour `HEALTH_CARE`: sous-modules Patients, Rendez-vous et Incidents qualité dans `Administration [Entreprise]`, avec listes recherchables, pagination, détail, formulaire plein écran mobile, modification et archivage via menu `...`.
- Ajout du modèle `EnterpriseSectorRecord` et de la migration `20260528100000_enterprise_sector_records` pour stocker des données métier sectorielles isolées par `organizationId`, `sectorCode`, `moduleCode` et `recordType`.
- Ajout des routes sécurisées `GET/POST /api/enterprise/[organizationId]/healthcare` et `PATCH/DELETE /api/enterprise/[organizationId]/healthcare/[recordId]`, avec validation Zod, rate limiting, contrôle du module activé, notifications ciblées et audit logs.
- Extension de l'itération `HEALTH_CARE` avec dashboard santé, consultations, dossiers médicaux, équipe médicale, laboratoire, pharmacie interne, facturation médicale, assurances/prises en charge, documents médicaux, confidentialité, paramètres et rapports santé.
- Ajout d'actions métier persistées pour les sous-modules santé: confirmation/annulation de rendez-vous, conversion en consultation, clôture/réouverture, validation labo, gestion de prises en charge, mouvements de stock et résolution d'incident.
- Ajout de la migration `20260528133000_healthcare_sector_iteration` pour enrichir le template santé, les organisations santé existantes et les blocs Activités santé avec documents médicaux, paramètres, rapports, laboratoire, pharmacie et documents patient.
- Ajout de la migration `20260529113000_enterprise_department_responsible` pour persister le responsable d'un département entreprise.
- Ajout de la migration `20260529170000_contextualize_client_modules` pour contextualiser les documents RAG, chunks, profils entreprise, activités entreprise, conversations, projets de conversation, messages, usages chat et notifications par `organizationId`.
- Ajout d'une documentation dédiée `docs/sectors/health-care.md` pour les sous-modules, workflows, permissions, stockage et limites de l'itération santé.
- Extension de `Mes collaborateurs`: la recherche d'invitation peut proposer les utilisateurs actifs de toute l'application afin de créer des groupes transversaux, tout en conservant l'acceptation obligatoire et le contrôle d'appartenance au groupe.

### Sécurisé

- Les données santé ne sont servies qu'aux membres actifs pouvant gérer l'administration de l'entreprise active et uniquement si l'organisation est une entreprise cliente active de secteur `HEALTH_CARE`.
- Les sous-modules santé avancés continuent d'utiliser `organizationId`, `sectorCode = HEALTH_CARE`, les permissions de module entreprise, le rate limiting et les audit logs; les incidents critiques notifient les responsables entreprise actifs.

## 2026-05-27

### Ajouté

- Ajout de la couche SaaS sectorielle: référentiel `BusinessSector`, templates sectoriels, modules/postes/départements/blocs d'activités/workflows générés par entreprise et demandes `EnterpriseActivityRequest` isolées par `organizationId`.
- Ajout de la migration `20260527143000_enterprise_sector_templates` avec seed idempotent des secteurs et du socle commun entreprise.
- Ajout des routes `/api/admin/business-sectors`, `/api/admin/sector-templates`, `/api/enterprise/[organizationId]/administration`, `/api/enterprise/[organizationId]/modules/[moduleId]` et `/api/enterprise/[organizationId]/activities`.
- Ajout des pages dynamiques privées `/enterprise-admin` et `/enterprise-activities` pour afficher `Administration [Entreprise]` et `Activités [Entreprise]` selon le contexte actif et le membership.
- Ajout de la documentation `docs/enterprise-sector-modules.md`.

### Amélioré

- Le bloc Administration `Entreprises clientes` utilise désormais une combobox de secteurs alimentée par la base, affiche l'aperçu du modèle sectoriel et peut appliquer le template à la création ou depuis le menu `...`.

### Corrigé

- Correction du build Vercel des modules SaaS sectoriels: les variables locales nommées `module` ont été renommées pour respecter `@next/next/no-assign-module-variable`, et le texte JSX des activités entreprise échappe correctement les apostrophes.

### Modifié

- Le menu `...` des entreprises clientes permet désormais de modifier les informations générales, gérer l'abonnement, archiver ou supprimer logiquement une entreprise avec audit et conservation des données internes.
- `Administration [Entreprise]` permet à un admin/manager entreprise d'ajouter un collaborateur existant à son organisation sans dépendre de DTSC, avec notification ciblée et contrôle backend du membership.

### Sécurisé

- Renforcement de l'isolation SaaS hybride: le contexte interne DTSC exige désormais un membership actif sur l'organisation `DTSC` (`dtsc-internal`) au lieu de se baser uniquement sur le rôle global.
- Blocage des modules internes historiques `/admin`, `/activities`, `/calendar` et de leurs routes API pour toute session qui n'est pas explicitement dans le tenant DTSC interne.
- Filtrage contextuel des modules partagés: annonces par `scope`/`organizationId`, groupes par `organizationId`/membership et tickets support par contexte actif.

### Ajouté

- Migration `20260527120000_strengthen_tenant_isolation` qui normalise l'entreprise interne `DTSC`, rattache les collaborateurs DTSC liés à un dossier RH actif et reclasse les groupes collaboratifs historiques dans le tenant DTSC.
- Conservation du contexte actif lors du heartbeat de session afin d'éviter qu'une session entreprise revienne silencieusement à un contexte global.

## 2026-05-22

### Corrigé

- Masquage complet du module `Calendrier interne` pour les utilisateurs `CLIENT`: navigation desktop/mobile, page `/calendar`, middleware et routes `/api/calendar*` bloquent désormais cet accès.
- Correction étendue du clipping des formulaires longs: les dialogues partagés utilisent désormais davantage de hauteur utile avec scroll interne, les accordéons/cartes Administration, Activités, Annonces et Support évitent de couper les extrémités des formulaires sur desktop/mobile.
- Correction de l'éditeur riche des annonces et publications publiques: la saisie sur brouillon local ne réapplique plus le HTML à chaque frappe, le curseur reste à l'endroit modifié et la suppression immédiate d'image fonctionne avant l'enregistrement.

### Ajouté

- Fondation SaaS hybride multi-entreprises: extension `Organization`, memberships actifs, grants `ADMIN_ENTREPRISE`, abonnements/facturation organisationnels et champs `organizationId` progressifs sur support, annonces et groupes.
- Création de l'organisation interne stable `dtsc-internal` via migration `20260522153000_hybrid_multi_tenant`.
- Connexion avec entreprise optionnelle: l'API `POST /api/auth/organizations` ne retourne que les entreprises où l'email saisi est membre actif, et `POST /api/auth/sign-in` refuse l'accès aux espaces internes clients sans membership actif.
- Sélecteur d'espace connecté après connexion via `POST /api/account/context`, avec contexte actif stocké en session.
- Bloc Administration `Entreprises clientes` pour créer/suspendre/archiver les organisations clientes, désigner ou retirer un administrateur entreprise et lier un plan, sans accès DTSC aux données métier privées.

## 2026-05-21

### Ajouté

- Ajout du module privé `Calendrier interne` avec page `/calendar`, navigation privée, vues mobiles premium, événements, disponibilités, participants et conflits.
- Ajout des modèles Prisma `CollaboratorAvailability`, `InternalCalendarEvent`, `InternalCalendarEventParticipant` et `InternalCalendarConflict` avec migration `20260521193000_internal_calendar`.
- Ajout des routes sécurisées `GET/POST /api/calendar`, `GET/POST /api/calendar/availabilities` et `GET/PATCH/DELETE /api/calendar/events/[id]`.
- Ajout d'une synchronisation COO vers le calendrier interne pour les tâches datées et réunions datées créées depuis l'Administration COO.
- Ajout d'une route sécurisée `POST /api/announcements/images` pour téléverser les images d'annonces via Supabase Storage, avec validation type/taille, rate limiting, audit log et URL publique contrôlée.
- Ajout de pièces jointes persistées sur les demandes collaboratives (`CollaboratorRequest.attachments`) avec migration `20260521152000_collaborator_request_attachments`.
- Ajout de réactions persistées `Like`/`Dislike` sur les réponses assistant du chatbot privé, avec migration `20260521113000_message_feedback` et route sécurisée `PATCH /api/conversations/messages/[id]/feedback`.
- Ajout d'un historique d'activité compact dans le Profil à partir des notifications, conversations, tickets support et messages de groupe réels de l'utilisateur.
- Ajout de filtres avancés dans les notifications: toutes, non lues, mentions, appels, groupes, administration, workflows, juridique, RH, système et critiques.
- Ajout d'une navigation flottante mobile pour les sections Administration autorisées.
- Ajout d'un badge monochrome DTSC dédié aux notifications PWA Android afin que l'icône système reste professionnelle et lisible.

### Corrigé

- Correction de la régression de plein écran des appels vidéo: suppression de l'observateur de mutations récursif sur le DOM LiveKit, focus plein écran appliqué de façon bornée avec fallback et conteneur plein écran ciblé par référence stable.
- Correction du polling global des événements d'appel afin qu'une réponse `401` désactive proprement le polling côté client sans bruit console répété.
- Correction du build Vercel du calendrier interne: les validateurs Zod create/update utilisent désormais un schéma de base non raffiné avant d'appliquer les règles de dates, afin d'éviter l'erreur `.partial() cannot be used on object schemas containing refinements`.
- Correction de la visibilité du calendrier interne: les événements privés et participants ne sont plus exposés largement aux collaborateurs non concernés.
- Correction de l'expérience plein écran des appels vidéo mobile: les contrôles restent au premier plan, disparaissent automatiquement après quelques secondes et réapparaissent au toucher.
- Correction du focus plein écran des appels vidéo: la sélection d'un participant ne peut plus masquer toute la scène si la tuile LiveKit n'est pas encore identifiable; l'affichage retombe sur la grille normale au lieu d'un écran vide.
- Correction du plein écran mobile des appels vidéo afin que la scène occupe réellement tout le viewport PWA, sans être réduite par la liste des participants ou les contrôles secondaires.
- Correction de l'enregistrement des préférences utilisateur sur mobile/PWA: les notifications navigateur sont désormais déclenchées via le service worker quand disponible et toutes les erreurs de permission/API mobile sont capturées sans casser l'application.
- Correction du bloc Abonnement afin que les surfaces de paiement et cartes de plans restent lisibles en mode clair comme en mode sombre.
- Correction des filtres de notifications pour qu'ils s'appuient sur les vrais `type`/`targetUrl` au lieu d'une recherche texte trop large qui mélangeait les catégories.
- Correction du positionnement des menus `...` des annonces et commentaires liés: actions en haut à droite avec icône verticale et menu glass aligné.

### Amélioré

- Le calendrier interne affiche ses indicateurs en accordéon, ouvre les détails événement en plein écran mobile et regroupe les sous-sections de détail en accordéons.
- Les événements calendrier disposent maintenant d'actions `...` pour modifier ou annuler un événement, avec formulaire responsive en modale haute.
- Les conflits calendrier affichent le collaborateur concerné et la raison métier lisible depuis son emploi du temps.
- Les événements de type tâche, réunion, blocage, mission ou appel planifié créent une source métier reliée dans COO, SCO ou Mes collaborateurs selon le type.
- Les cartes d'annonces sont recentrées avec marges symétriques et menu d'actions horizontal en haut à droite.
- Les formulaires des blocs Administration s'ouvrent dans des boîtes de dialogue hautes et scrollables pour éviter qu'ils restent compressés dans l'arrière-plan des accordéons.
- Les champs `Input` partagés récupèrent automatiquement un libellé accessible et une info contextuelle depuis leur placeholder lorsqu'aucun label explicite n'est fourni.
- Le calendrier interne détecte les chevauchements, absences, congés, missions, indisponibilités et créneaux hors horaires disponibles avant création ou modification d'événement.
- Les messages sortants des groupes `Mes collaborateurs` affichent un accusé compact: une coche quand le message est envoyé et deux coches vertes lorsque tous les autres membres actifs ont confirmé la lecture.
- Sur mobile/PWA, le sélecteur de vue plein écran d'appel disparaît automatiquement après le choix d'un participant ou du partage d'écran, puis réapparaît au toucher de la scène.
- Le plein écran des appels vidéo gagne un sélecteur premium permettant de focaliser la vue automatique, un partage d'écran ou un participant précis sur desktop/mobile, avec un fond de scène uniformisé autour des tuiles arrondies.
- Le chat pendant appel devient une boîte flottante autonome, déplaçable, redimensionnable et dotée d'un scroll vertical interne borné avec saisie fixe.
- Les appels vidéo sont mieux adaptés mobile/desktop: tuiles plus arrondies et visibles sur mobile, avatars fournisseur réduits/remplacés par la photo de profil quand disponible, bouton plein écran renommé en `Réduire l'écran` une fois actif et PWA autorisée en portrait/paysage.
- L'éditeur des annonces internes supporte désormais l'ajout de plusieurs images par sélection ou glisser-déposer, l'optimisation client et un aperçu mobile/desktop avant publication.
- Les demandes collaboratives acceptent des fichiers joints depuis l'appareil; le demandeur et le destinataire peuvent les prévisualiser ou télécharger via route privée.
- L'expérience d'appel de groupe masque les contrôles LiveKit bruts, ajoute des contrôles DTSC pour le partage d'écran et le plein écran, et conserve explicitement l'appel actif pendant l'ouverture du chat.
- Les nouveaux libellés visibles des annonces et appels sont raccordés aux dictionnaires FR/EN afin de suivre la langue choisie dans les paramètres.
- La route `/offline` et le fallback statique `public/offline.html` reprennent le design mobile/PWA premium actuel avec surfaces glass, logo DTSC et safe-area mobile.
- Harmonisation du rendu clair/sombre des accordéons, listes premium et menu flottant Administration avec des surfaces glass basées sur les variables DTSC.
- Les blocs de données des sections Administration sont désormais affichés comme accordéons premium, avec cartes de liste cohérentes et lisibles en mode sombre.
- Accordéons premium appliqués aux zones Dashboard, Entreprise, Abonnement et Profil pour réduire le scroll mobile/PWA.
- Module Abonnement rendu plus premium avec cartes glass, badges de plan actif et états de paiement connectés aux données backend existantes.
- Commentaires des annonces internes et publications publiques repliés par défaut, avec ouverture volontaire, pagination et scroll interne.
- Formulaire de création d'annonce et formulaire de ticket support repliés pour libérer l'espace mobile.
- Discussions de tickets support contenues dans un fil scrollable avec saisie accessible.
- Dropdowns Radix stylés en combobox premium partagée.

## 2026-05-20

### Corrigé

- Correction d'une régression de rendu global causée par l'import direct des styles LiveKit dans `app/globals.css`; les styles d'appel sont maintenant scoped via `.dtsc-livekit-room` afin de préserver le design premium global.
- Amélioration de l'UX des appels audio/vidéo: suppression des libellés techniques visibles, messages d'état humains, bouton micro relié à la piste audio réelle, séparation stricte entre `Quitter` et `Terminer`, durée d'appel affichée et durée finale persistée.

### Ajouté

- Intégration de la base visuelle mobile/PWA premium issue du redesign: header compact, navigation bottom, composants glass/premium réutilisables et safe-area mobile pour les espaces privés sans remplacer les modules backend existants.
- Ajout de préférences d'appel persistées par utilisateur: sons, notifications, alertes flottantes, événements participants, volume, durée des alertes et démarrage micro/caméra.
- Ajout d'une alerte flottante globale d'événements d'appel alimentée par une route sécurisée avec polling léger pour les groupes dont l'utilisateur est membre.
- Ajout d'une architecture persistée d'appels audio/vidéo pour les groupes `Mes collaborateurs`, avec sessions d'appel, participants, événements, messages système, notifications et audit de groupe.
- Ajout du service backend `lib/livekit-service.ts` pour générer des tokens LiveKit temporaires côté serveur sans exposer les clés LiveKit au frontend.
- Ajout du mode de tenue des réunions COO: commentaires uniquement, audio ou vidéo. Les réunions audio/vidéo créent automatiquement un groupe de réunion dédié ou lient un groupe existant.
- Ajout des modèles et routes pour comptes rendus de réunion COO, décisions et création de tâches de suivi liées à une décision.

### Sécurisé

- Les routes d'appels vérifient la session, l'appartenance active au groupe, le statut de l'appel et les droits de gestion avant de démarrer, rejoindre, quitter ou terminer une session.
- Les variables `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` et `LIVEKIT_URL` sont documentées comme strictement serveur; seul un token participant temporaire peut être renvoyé à un membre autorisé.

### Amélioré

- UX mobile/PWA des échanges: les modales partagées utilisent davantage la hauteur écran avec scroll interne, les conversations de groupes et le chatbot gagnent en espace utile, les cartes de groupes affichent mieux appels actifs/badges/aperçus et les historiques systèmes d'appels sont plus compacts.
- Appels de groupe: ajout d'un panneau chat léger pendant appel audio/vidéo. Les messages saisis pendant l'appel sont envoyés via la messagerie de groupe existante, persistés, compatibles mentions et visibles dans l'historique normal du groupe.
- Demandes collaboratives dans Activités DTSC: la demande initiale et la réponse du destinataire sont désormais affichées dans deux blocs visuels distincts, avec le nom du collaborateur répondant en petit libellé coloré.
- Le bloc de réponse et d'avancement d'une demande collaborative est visible uniquement pour le collaborateur destinataire.
- Les formulaires juridiques du module Activités DTSC remplacent le champ texte libre `Document joint ou lien interne` par un vrai téléversement de fichier depuis l'appareil, avec aperçu local image/PDF et téléchargement avant envoi.
- Les routes de fichiers opérationnels Administration acceptent maintenant les blocs qui utilisent déjà des champs fichier (`MPO`, `CTO`, `LA`, `CEO`) en plus de `COO`, `HR & CFO` et `SCO`.

### Sécurisé

- La route `PATCH /api/activities/requests/[id]` bloque l'ajout d'une réponse ou l'avancement métier si l'utilisateur courant n'est pas le collaborateur destinataire; l'annulation reste réservée au demandeur.
- Ajout des routes privées `POST /api/activities/files` et `GET /api/activities/files/[...path]` pour stocker les pièces jointes Activités DTSC dans Supabase Storage, valider taille/type, journaliser uploads/téléchargements et limiter la lecture à l'auteur, ADMIN, LA ou CEO.
- La route `POST /api/activities/collaborator-workflows` refuse désormais les liens arbitraires dans les champs `documentUrl` et `attachmentUrl`; ces valeurs doivent provenir d'un téléversement autorisé.

## 2026-05-18

### Ajouté

- Paramètre global `Brouillons publics par non-clients` permettant aux rôles non-client autorisés d'écrire des publications publiques en brouillon sous leur nom.
- Action serveur du chatbot privé permettant d'envoyer un message à DTSC ou de créer un ticket support après collecte des informations et confirmation explicite du client.
- Migration `20260518162000_publication_draft_contributors` pour ajouter le réglage `allowNonClientPublicationDrafts`.
- Nouvelles questions FAQ sur la landing page pour couvrir l'assistant public, les ressources non inventées, les actions du chatbot privé, la sécurité et les brouillons de publications.
- Streaming progressif des réponses de l'assistant IA public sur la landing page pour éviter l'affichage brusque des messages.
- Paramètre global administrateur `Assistant IA landing page` permettant d'activer ou désactiver l'agent public.
- Fallback public lorsque l'agent est désactivé: résumé complet de DTSC et orientation vers le formulaire manuel de contact/newsletter.
- Migration `20260518143000_public_agent_setting` pour ajouter le réglage `publicAgentEnabled`.
- Garde-fou anti-hallucination sur les ressources: l'agent ne peut citer que les publications réellement publiées et fournies par le contexte serveur.
- Garde-fou serveur hors sujet: les questions manifestement non liées à DTSC sont refusées avant appel au modèle IA.
- Agent IA public DTSC sur la landing page avec widget flottant, qualification progressive des prospects, confirmation avant transmission, création ou mise à jour de fiche prospect et notification email à l'équipe DTSC.
- Champs de qualification IA dans les inscrits newsletter: service demandé, besoin décrit, urgence, budget estimatif, canal de contact préféré et résumé IA.
- Migration `20260518120000_public_ai_agent_leads` pour enrichir les prospects newsletter sans créer de table doublon.
- Création du changelog projet dans `docs/CHANGELOG.md` pour versionner les évolutions fonctionnelles et techniques à chaque commit.

### Corrigé

- Ajout d'une confirmation applicative avant modification ou suppression des publications publiques afin d'éviter les suppressions accidentelles d'articles publiés.
- Ajout d'une confirmation avant modification, conversion, désabonnement ou archivage d'un prospect newsletter.

### Documenté

- Variables d'environnement, route API de l'agent IA public, flux de qualification prospect et règles de sécurité associées.

### Amélioré

- Gouvernance des publications publiques: les contributeurs non-admin peuvent modifier uniquement leurs brouillons, tandis que publication et suppression restent réservées aux administrateurs.
- Assistant IA public: contexte enrichi avec les thèmes de FAQ pour orienter les visiteurs vers la FAQ, les ressources ou la newsletter selon le cas.
- Emails entrants prospects/newsletter: structure professionnelle DTSC, sections claires, tableau HTML responsive et texte de secours mieux formaté pour les clients mobiles.
- Responsive du module Activités DTSC: les modales, sélecteurs et formulaires collaborateur restent désormais contenus dans leur zone naturelle sur mobile et desktop.
- Notifications: les catégories et statuts techniques affichés avec underscores sont remplacés par des libellés français lisibles dans les badges, détails et aperçus.
# 2026-05-19

- Encapsulation des actions de commentaires des annonces et publications publiques dans les menus `...`, avec `Répondre`, `Copier le texte`, `Modifier` et `Supprimer` affichés selon les permissions.
- Amélioration des groupes `Mes collaborateurs`: mentions interactives, badge de mentions non lues, marquage lu à l'ouverture, réponse à un message via `replyToId`, en-tête mobile sobre et conversation mieux isolée en plein écran mobile.
- Centralisation du formulaire `Formuler une demande à un collaborateur` dans le bloc `Demandes collaboratives` du module Activités DTSC.
- Enrichissement de `/offline` avec présentation DTSC, services, FAQ, contact essentiel et version de cache PWA excluant les pages privées sensibles.
- Ajout de `public/offline.html` comme fallback PWA autonome afin d'éviter les erreurs client Next.js hors ligne lorsque les chunks applicatifs ne sont pas disponibles sur mobile.
- Ajout d'une mise à jour automatique des PWA installées: vérification au retour en ligne, au focus, au retour de visibilité et activation du nouveau service worker avec rechargement unique du client.
- Amélioration du contraste des conversations chatbot partagées dans les groupes: cartes de preview et modales de snapshot lisibles en mode sombre comme en mode clair, avec hiérarchie visuelle plus premium.
- Ajout d'une modale professionnelle de détails de groupe accessible par clic sur l'en-tête du groupe dans `Mes collaborateurs`, avec métriques, propriétaire, rôle courant, membres et invitations en attente.
- Ajout de snapshots persistants `CollaborationSharedConversation` pour partager une copie consultable des conversations chatbot dans les groupes sans exposer la conversation privée originale.
- Ajout de la pagination/cursor et du scroll borné pour les messages de groupe et les commentaires transversaux Activités DTSC.
- Amélioration du module Mes collaborateurs: chargement progressif des anciens messages, couleurs stables par intervenant et ouverture des conversations chatbot partagées en boîte de dialogue.
- Remplacement des actions visibles du chatbot par un menu `...` avec infos, copie de lien, partage, transfert vers groupe, renommage et suppression.
- Amélioration du transfert d'annonces avec recherche intelligente par nom, email, rôle, poste ou département, sélection multiple et résumé des destinataires.
- Enrichissement de l'éditeur riche avec palette de couleurs contrôlée et types de listes avancés: puce simple, cercle, carré, numérotée, alphabétique, checklist et tirets.
- Extension des dictionnaires i18n FR/EN pour les commentaires, conversations, annonces, chatbot, groupes et éditeur.
- Documentation AGENTS mise à jour avec les standards permanents de commentaires, conversations, snapshots de partage, annonces, éditeur riche, i18n et mobile-first.

- Ajout du module privé **Mes collaborateurs** avec groupes, invitations individuelles ou groupées, membres, messagerie, mentions, partage de conversations chatbot, contact support DTSC, notifications et audit de groupe.
- Ajout d'un composant réutilisable `ActionMenu` pour les menus contextuels `...`, appliqué au fil des annonces et aux messages collaboratifs.
- Enrichissement des annonces: soft delete, archivage, épinglage, copie persistée, transfert, signalement, indicateurs, informations détaillées et compteurs.
- Ajout de la persistance des mentions collaboratives via `CooCommentMention` et des notifications de mention dans les commentaires d'activités.
- Ajout des helpers `lib/user-format.ts` pour afficher les dates du chatbot, messages et historiques selon la langue, le fuseau horaire et le format utilisateur.
- Ajout des dictionnaires `locales/fr.json` et `locales/en.json`, avec application sur la navigation privée et les nouvelles interactions.
- Documentation AGENTS, README, documentation technique et pages légales actualisées pour les nouvelles données, notifications, messagerie et standards UX.
# 2026-06-08

- Correction du build Vercel PHARMACY: construction du payload JSON dans un objet mutable strictement typé, avec exclusion des valeurs `undefined` avant transmission à Prisma.
- Implémentation de l'itération sectorielle `PHARMACY` dans Administration et Activités Entreprise: quinze sous-modules pharmacie, dashboard KPI, listes recherchables, formulaires responsives, détails et actions persistées.
- Ajout des routes sécurisées `GET/POST/PATCH/DELETE /api/enterprise/[organizationId]/pharmacy`, avec validation Zod, contrôle des références par `organizationId`, permissions de module, rate limiting, audit et archivage logique.
- Ajout des impacts stock transactionnels et idempotents pour ventes, réceptions et annulations, avec blocage des lots expirés, rappelés, en quarantaine ou insuffisants.
- Ajout de la migration idempotente `20260608143000_pharmacy_sector_iteration`, des loaders conditionnels PHARMACY, des blocs Activités spécifiques et de la documentation sectorielle.
# 10 juin 2026 - Caisse, factures et paiements PHARMACY

- Ajout des sessions de caisse, paiements multi-modes, factures, reçus de caisse, remboursements, écarts et validation de clôture isolés par entreprise.
- Remplacement du placeholder `CASH_INVOICES_PAYMENTS` par treize vues métier responsives et des formulaires plein écran guidés.
- Ajout des calculs transactionnels de clôture, du recalcul du statut de paiement des ventes, de la génération facture/reçu et des garde-fous contre doubles sessions et remboursements excessifs.
