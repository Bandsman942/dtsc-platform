# Secteur HEALTH_CARE - Santé / clinique / hôpital / cabinet médical

## Objectif

L'itération `HEALTH_CARE` transforme le modèle sectoriel santé en espace exploitable pour une clinique, un cabinet médical ou un petit hôpital. Les données restent isolées par `organizationId` et sont accessibles uniquement aux membres actifs autorisés de l'entreprise.

## Sous-modules Administration Santé

- Tableau de bord santé: KPI patients, rendez-vous, consultations, dossiers incomplets, factures, prises en charge, incidents, alertes laboratoire et pharmacie.
- Patients: identité, contacts, statut, allergies, antécédents et notes administratives.
- Rendez-vous: planification, confirmation, absence, annulation et conversion en consultation.
- Consultations: constantes vitales, symptômes, examen clinique, diagnostics, conduite, prescriptions, examens et clôture.
- Dossiers médicaux: résumé, antécédents, allergies, traitements, alertes et notes confidentielles.
- Équipe médicale: affectation des membres, postes santé, services, spécialités et permissions.
- Laboratoire: demandes d'examens, résultats, conclusions et validation.
- Pharmacie interne: produits médicaux, stock, seuils, péremption et mouvements.
- Facturation médicale: factures, lignes, montants, modes de paiement et statuts.
- Assurances & prises en charge: assureurs, montants demandés/approuvés, soumission, approbation et rejet.
- Incidents qualité: incidents patient, soin, confidentialité, administratif, laboratoire, pharmacie ou facturation.
- Documents médicaux: références de documents médicaux contrôlés et niveau de confidentialité.
- Confidentialité médicale: règles internes liées aux dossiers et notes sensibles.
- Paramètres santé: établissement, préfixes, services, rôles autorisés et verrouillage.
- Rapports santé: période, service, résumé, difficultés et recommandations.

## Module Patients dédié

Le module Patients utilise désormais `HealthPatient` comme référentiel central et `HealthPatientEvent` pour son historique. Il fournit :

- une liste avec recherche par nom, téléphone ou identifiant, filtres sexe/statut/période, pagination, badges et empty state professionnel ;
- un formulaire plein écran structuré en identité, coordonnées, contact d’urgence, informations médicales de base et informations administratives ;
- une vue détail avec résumé administratif, contact d’urgence, informations médicales autorisées, activités liées et historique ;
- des actions réelles vers les formulaires Rendez-vous, Consultation, Document médical et Dossier médical lorsque ces modules sont actifs ;
- un archivage logique et des changements de statut audités.

Champs principaux : `patientNumber`, `fullName`, `sex`, `birthDate`, téléphones, email, adresse, contact d’urgence, profession, état civil, groupe sanguin, allergies, antécédents, traitements chroniques, notes médicales et administratives, assurance, source d’enregistrement, statut, créateur, modificateur et dates d’archivage ou décès.

Routes dédiées :

- `GET|POST /api/enterprise/[organizationId]/healthcare/patients` ;
- `GET|PATCH /api/enterprise/[organizationId]/healthcare/patients/[patientId]`.

Les routes vérifient la session, le membership actif, `sectorCode = HEALTH_CARE`, le module `PATIENTS`, `organizationId`, Zod, l’origine et le rate limit. Les données médicales sensibles sont masquées côté serveur pour les lecteurs non gestionnaires. Les statuts Archivé et Décédé exigent un motif. L’ancien endpoint Santé générique refuse toute mutation Patients.

La migration `20260612103000_healthcare_patients` reprend les patients génériques existants sans suppression et conserve `legacyRecordId`. Cette référence permet aux rendez-vous, consultations, factures, documents, prises en charge, incidents et dossiers médicaux existants de rester reliés au patient pendant leur migration progressive vers des tables dédiées. Après la reprise, les anciennes clés médicales sensibles sont retirées du miroir générique, qui ne conserve que les données administratives nécessaires à la compatibilité.

## Module Rendez-vous dédié

Le module Rendez-vous utilise `HealthAppointment` et `HealthAppointmentEvent`. Il fournit une liste paginée, une vue planning simple par jour, des filtres par période, professionnel, statut, priorité et type, un formulaire plein écran, un détail complet et des actions de statut persistées. Le même workspace sécurisé est disponible dans Administration et Activités entreprise ; les actions visibles dépendent des permissions retournées par l’API.

Chaque rendez-vous référence obligatoirement un `HealthPatient` actif du même `organizationId`. Le professionnel doit être un membre actif et le service un `EnterpriseDepartment` actif de la même entreprise. Les réponses API n’exposent que les champs administratifs nécessaires du patient et masquent les notes internes sans accès sensible.

Statuts et transitions principales :

- Planifié → Confirmé, Annulé, Absent ou Converti ;
- Confirmé → En attente, En cours, Annulé, Absent ou Converti ;
- En attente → En cours, Annulé ou Absent ;
- En cours → Réalisé, Annulé ou Converti ;
- Réalisé → Converti si autorisé.

Les rendez-vous réalisés, annulés et convertis sont verrouillés contre modification libre. L’annulation exige un motif. La conversion crée une consultation dédiée liée au patient et au rendez-vous, puis renseigne `convertedConsultationId`; une transaction et une contrainte unique empêchent les doublons.

Routes dédiées :

- `GET|POST /api/enterprise/[organizationId]/healthcare/appointments` ;
- `GET|PATCH /api/enterprise/[organizationId]/healthcare/appointments/[appointmentId]` ;
- `POST /api/enterprise/[organizationId]/healthcare/appointments/[appointmentId]/actions`.

La migration `20260612153000_healthcare_appointments` reprend sans suppression les rendez-vous génériques qui référencent un patient valide, conserve `legacyRecordId` pour la compatibilité avec Consultations et fusionne les permissions recommandées dans les postes Santé officiels.

## Module Consultations dédié

Le module Consultations utilise `HealthConsultation` et `HealthConsultationEvent`. Il fournit une liste paginée avec recherche et filtres, un formulaire clinique plein écran, une vue détail protégée, un historique et des actions persistées. Le workspace est réutilisé dans Administration et Activités ; Patients peut l’ouvrir avec le patient prérempli.

La consultation exige un `HealthPatient` actif et un professionnel membre actif du même `organizationId`. Un rendez-vous est optionnel, mais doit appartenir au même patient et ne peut produire qu’une seule consultation. La conversion Rendez-vous transfère le patient, le professionnel, le service, le motif, le type et la priorité.

Les sections persistées couvrent le motif et l’histoire clinique, les constantes vitales, l’examen clinique, les diagnostics, la conduite à tenir, la prescription structurée, les examens demandés et les recommandations. L’IMC est calculé côté serveur lorsque poids et taille sont disponibles. Les alertes de plage limitent uniquement les incohérences de saisie et ne remplacent pas le jugement médical.

Statuts et transitions :

- Brouillon → En cours ou Annulée ;
- En cours → En attente d’examens, Clôturée ou Annulée ;
- En attente d’examens → En cours, À revoir ou Annulée ;
- À revoir → En cours, Clôturée ou Annulée ;
- Clôturée → En cours uniquement via réouverture motivée.

Les consultations clôturées ou annulées sont verrouillées. Réouverture et annulation exigent un motif. Chaque modification et transition crée un événement; les actions sensibles créent aussi un audit. Sans permission sensible, l’API masque constantes, examen, diagnostics, prescriptions et recommandations.

Routes dédiées :

- `GET|POST /api/enterprise/[organizationId]/healthcare/consultations` ;
- `GET|PATCH /api/enterprise/[organizationId]/healthcare/consultations/[consultationId]` ;
- `POST /api/enterprise/[organizationId]/healthcare/consultations/[consultationId]/actions`.

La consultation conserve un miroir administratif `legacyRecordId` pour préparer les liens avec Dossiers médicaux, Laboratoire, Pharmacie interne, Facturation médicale et Documents médicaux sans créer d’actions décoratives. Ces modules continueront d’utiliser ce lien jusqu’à leur migration dédiée.

## Module Dossiers médicaux dédié

Le module Dossiers médicaux utilise `HealthMedicalRecord` comme dossier principal unique par patient. Les antécédents, allergies, traitements actuels, alertes, notes confidentielles et événements utilisent des tables dédiées reliées au dossier et à `organizationId`.

La liste fournit recherche, statut, pagination, badges d’alertes et résumé administratif limité. Le détail médical sensible affiche la synthèse, les éléments structurés, les alertes actives en premier, les consultations dédiées du patient et l’historique. Les formulaires et détails sont des dialogues hauts responsive; les actions sont regroupées dans des menus contextuels.

Une allergie `SEVERE` ou `LIFE_THREATENING` crée automatiquement une `HealthMedicalAlert` active dans la même transaction. Les notes `HealthConfidentialNote` ne sont jamais chargées pour un utilisateur sans permission confidentielle. Les consultations liées sont lues depuis `HealthConsultation` et ne sont pas dupliquées.

Routes dédiées :

- `GET|POST /api/enterprise/[organizationId]/healthcare/medical-records` ;
- `GET|PATCH /api/enterprise/[organizationId]/healthcare/medical-records/[recordId]` ;
- `POST|PATCH /api/enterprise/[organizationId]/healthcare/medical-records/[recordId]/items`.

Toutes les routes contrôlent session, membership actif, secteur et module, `organizationId`, origine, rate limit, Zod, permissions et audit. Les routes Santé génériques refusent désormais les mutations Dossiers médicaux.

## Module Équipe médicale dédié

Le module Équipe médicale utilise `HealthStaffAssignment`, `HealthSpecialty` et `HealthStaffEvent`. Une affectation relie obligatoirement un membre actif et son utilisateur à un poste Santé, un service de l’entreprise, une disponibilité, des permissions Santé et éventuellement une spécialité et un responsable professionnel. Un même membre ne peut avoir qu’une affectation Santé, qui peut être suspendue, archivée puis réactivée selon autorisation.

Le workspace partagé entre Administration et Activités fournit un tableau de bord réel, recherche, filtres par poste/service/spécialité/statut, pagination, détail, activité liée, permissions lisibles et actions persistées. Les formulaires utilisent uniquement les membres, postes, services, spécialités et responsables du même `organizationId`.

Postes complémentaires ajoutés aux organisations Santé existantes : médecin spécialiste, infirmier chef, responsable laboratoire, assistant pharmacien, archiviste médical, technicien biomédical et autre professionnel Santé. Les services médicaux recommandés et les spécialités initiales sont créés de manière additive.

Routes dédiées :

- `GET|POST /api/enterprise/[organizationId]/healthcare/staff` ;
- `GET|PATCH /api/enterprise/[organizationId]/healthcare/staff/[staffId]`.

Rendez-vous et Consultations utilisent désormais les affectations Santé actives et disponibles pour leurs comboboxes et leurs validations serveur. Consultations limite en plus l’assignation aux postes cliniques compatibles. Dossiers médicaux vérifie les permissions `health.medical_records.view_sensitive` et `health.medical_records.confidential_notes` de l’affectation active.

## Module Laboratoire dédié

Le module Laboratoire utilise `HealthLabRequest`, `HealthLabRequestItem`, `HealthLabTestCatalog` et `HealthLabEvent`. Chaque demande appartient à une organisation et à un patient, peut être reliée à une consultation et au dossier médical existant, référence un demandeur médical actif, un examen principal et une liste d’examens du catalogue.

Workflow persistant : `Demandé` → `En attente de prélèvement` → `Prélèvement effectué` → `En analyse` → `En attente de validation` → `Validé` → `Transmis au médecin`. Une demande active peut être annulée; un prélèvement non conforme retourne en attente; un résultat validé nécessite la permission de correction et un motif pour revenir en attente de validation.

Le catalogue initial reste volontairement limité et extensible : NFS, glycémie, créatinine, urée, CRP, goutte épaisse, test rapide paludisme, bandelette urinaire, ECBU, coprologie, test rapide VIH, HBsAg, groupe sanguin et autre examen. Chaque entreprise Santé peut ajouter ses propres examens avec catégorie, prélèvement, unité et valeurs de référence.

Permissions : `health.laboratory.view`, `view_sensitive`, `create_request`, `update_request`, `cancel_request`, `collect_sample`, `enter_result`, `validate_result`, `correct_validated_result`, `transmit_result` et `manage_catalog`. Les résultats et interprétations sont masqués sans permission sensible.

Routes dédiées :

- `GET|POST /api/enterprise/[organizationId]/healthcare/laboratory` ;
- `GET|PATCH /api/enterprise/[organizationId]/healthcare/laboratory/[requestId]` ;
- `POST /api/enterprise/[organizationId]/healthcare/laboratory/[requestId]/actions`.

Patients affiche l’activité laboratoire liée. Consultations affiche ses demandes et résultats accessibles. Dossiers médicaux lit les demandes du patient directement depuis les tables Laboratoire. Facturation et Documents médicaux restent des liens futurs : aucun bouton décoratif ni fausse facture n’est exposé.

## Pharmacie interne dédiée

Le module `INTERNAL_PHARMACY` utilise désormais `HealthPharmacyProduct`, `HealthPharmacyBatch`, `HealthPharmacyStockMovement` et `HealthPharmacyDispensation`. Le workspace partagé entre Administration et Activités fournit tableau de bord, recherche, filtres, produits, lots, entrées, sorties, délivrances, ajustements, alertes stock/péremption et historique.

Chaque écriture est transactionnelle et isolée par `organizationId`. Les sorties refusent un stock insuffisant, un produit bloqué/archivé et un lot expiré/bloqué. Sans lot choisi, la sortie utilise le premier lot délivrable selon FEFO. Patient, consultation, service et prescripteur sont validés dans la même organisation; une consultation et un patient fournis ensemble doivent correspondre.

Les produits sensibles exigent explicitement `health.pharmacy.authorize_sensitive_exit`; aucun rôle administratif ne reçoit automatiquement ce droit. Sans `health.pharmacy.view_sensitive`, les mouvements sensibles sont exclus, les prix/consignes sensibles sont masqués et les délivrances sensibles ne sont pas affichées dans Patient, Consultation ou Dossier médical.

Permissions : `health.pharmacy.view`, `view_sensitive`, `create_product`, `update_product`, `archive_product`, `manage_batches`, `stock_entry`, `stock_exit`, `dispense`, `adjust_stock`, `manage_inventory`, `authorize_sensitive_exit` et `view_movements`.

Routes dédiées :

- `GET|POST /api/enterprise/[organizationId]/healthcare/internal-pharmacy` ;
- `GET|PATCH /api/enterprise/[organizationId]/healthcare/internal-pharmacy/[productId]` ;
- `POST /api/enterprise/[organizationId]/healthcare/internal-pharmacy/actions`.

Une délivrance facturable reçoit `billingStatus = TO_BILL`, sans créer de fausse facture. La prescription reste liée à `HealthConsultation.prescriptionText` tant qu’un référentiel de prescriptions structurées n’est pas disponible.

## Migrations

- `20260528100000_enterprise_sector_records`: ajoute `EnterpriseSectorRecord`.
- `20260528133000_healthcare_sector_iteration`: enrichit le template `HEALTH_CARE`, les organisations santé existantes et les blocs Activités santé avec documents médicaux, paramètres santé, rapports santé, signalement laboratoire, rupture pharmacie et dépôt de document patient.
- `20260529113000_enterprise_department_responsible`: ajoute `EnterpriseDepartment.responsibleUserId` pour persister le responsable d'un département entreprise.
- `20260612103000_healthcare_patients`: ajoute Patients et historique dédiés.
- `20260612153000_healthcare_appointments`: ajoute Rendez-vous et historique dédiés.
- `20260612190000_healthcare_consultations`: ajoute Consultations et historique dédiés.
- `20260612223000_healthcare_medical_records`: ajoute Dossiers médicaux, éléments structurés, alertes, notes confidentielles et historique dédiés.
- `20260612233000_healthcare_staff`: ajoute Équipe médicale, spécialités, affectations, historique, postes et services Santé recommandés.
- `20260613013000_healthcare_laboratory`: ajoute Laboratoire, catalogue d’examens, demandes multi-examens, résultats et historique dédiés.
- `20260613093000_healthcare_internal_pharmacy`: ajoute produits, lots, mouvements, délivrances et permissions de la Pharmacie interne dédiée.

## Stockage et API

Les enregistrements sont stockés dans `EnterpriseSectorRecord` avec:

- `organizationId`;
- `sectorCode = HEALTH_CARE`;
- `moduleCode`;
- `recordType`;
- `status`;
- `priority`;
- `assignedToUserId`;
- `payloadJson` pour les champs métier.

Les formulaires santé utilisent désormais des références logiques validées côté backend dans `payloadJson`:

- `patientRecordId` vers un enregistrement `PATIENTS` de la même organisation;
- `appointmentRecordId` vers un enregistrement `APPOINTMENTS` de la même organisation;
- `consultationRecordId` vers un enregistrement `CONSULTATIONS` de la même organisation;
- `departmentId` vers `EnterpriseDepartment` de la même organisation;
- `positionId` vers `EnterprisePosition` de la même organisation.

Les champs patient, rendez-vous, consultation, collaborateur, département, poste, statut et priorité sont rendus sous forme de combobox/selects alimentés par les données de l'entreprise active. Les routes refusent toute référence qui ne correspond pas à `organizationId`.

Routes:

- `GET /api/enterprise/[organizationId]/healthcare`;
- `POST /api/enterprise/[organizationId]/healthcare`;
- `PATCH /api/enterprise/[organizationId]/healthcare/[recordId]`;
- `DELETE /api/enterprise/[organizationId]/healthcare/[recordId]`.

Chaque route vérifie la session, le membership actif, l'organisation cliente active, `sectorCode = HEALTH_CARE`, le module entreprise activé, la validation Zod, le rate limiting et l'audit. Les notifications d'assignation et d'incident critique restent non bloquantes par rapport à l'écriture principale.

## Actions métier

Les actions visibles dans les menus `...` sont persistées:

- rendez-vous: confirmer, mettre en attente, démarrer, réaliser, annuler avec motif, marquer absent et convertir en consultation sans doublon;
- consultation: clôturer, rouvrir;
- laboratoire: valider un résultat;
- prise en charge: soumettre, approuver, rejeter;
- pharmacie: entrée stock, sortie stock, ajustement;
- incident qualité: marquer résolu;
- tous les sous-modules: consulter, modifier, archiver.

Les consultations clôturées, résultats validés et factures payées sont verrouillés contre modification libre jusqu'à réouverture autorisée. Les incidents critiques notifient les rôles de gestion actifs de l'entreprise.

## Activités Santé

`Activités [Entreprise]` reste l'interface collaborateur. Les blocs santé créent une vraie `EnterpriseActivityRequest` liée à l'organisation:

- signaler incident patient;
- demander prise en charge;
- soumettre rapport médical;
- demander avis médical;
- signaler problème de confidentialité;
- signaler problème laboratoire;
- signaler rupture pharmacie;
- soumettre document patient.

Chaque type de demande possède maintenant son formulaire métier avec destinataire obligatoire parmi les membres actifs de l'entreprise. Les champs contextualisés sont persistés dans la description et dans `metadataJson`, puis la notification cible le destinataire choisi. Les workflows partagés depuis `Administration [Entreprise]` sont affichés dans un bloc dédié `Workflows partagés`.

## Administration entreprise Santé

`Administration [Entreprise]` sépare désormais clairement:

- `Modules entreprise`: socle commun + sous-modules santé réellement activés pour l'organisation. La désactivation masque le sous-module santé dans l'administration et bloque aussi l'accès API au sous-module sans supprimer les données.
- `Collaborateurs`: invitation d'un utilisateur existant avec statut `INVITED`; l'utilisateur n'est pas intégré comme membre actif tant que l'invitation n'est pas acceptée par le workflow prévu.
- `Postes & permissions`: création ou mise à jour de `EnterprisePosition`, rattachement à un département, statut actif, poste clé et permissions santé recommandées.
- `Départements`: création ou mise à jour de `EnterpriseDepartment`, ordre d'affichage et responsable membre actif.
- `Workflows / Procédures`: création de `EnterpriseWorkflow`, catégorie santé, étapes, responsables, destinataires et notifications de partage.
- `Paramètres entreprise`: persistance des paramètres généraux sur `Organization` et des paramètres santé dans `Organization.settingsJson.health`.

Ces formulaires d'administration santé et entreprise ne sont plus rendus directement dans les accordéons: ils s'ouvrent depuis une carte d'action vers un dialogue haut responsive avec scroll interne, afin de garder les longues saisies lisibles sur desktop, tablette et mobile.

Le bloc technique `Blocs Activités entreprise` n'est plus exposé comme section principale de l'administration cliente; il reste une configuration de template utilisée par `Activités [Entreprise]`.

## Postes et permissions

Permissions recommandées:

- Médecin: patients en lecture, consultations, dossiers médicaux autorisés, demandes laboratoire, documents médicaux.
- Réceptionniste: patients administratifs limités, rendez-vous, facturation limitée.
- Laborantin: laboratoire, résultats, patients en lecture limitée.
- Pharmacien: pharmacie interne, mouvements de stock, patients en lecture limitée.
- Caissier médical: facturation médicale, patients administratifs limités.
- Responsable qualité: incidents qualité, rapports, alertes.
- Directeur médical / admin entreprise: supervision santé selon rôle organisationnel.

Le backend applique les contrôles via `canAccessEnterpriseModule()` avec le code réel de chaque sous-module santé afin qu'une désactivation côté `EnterpriseModule` soit respectée par l'API.

## Confidentialité

- Une donnée santé appartient toujours à une seule entreprise.
- DTSC global ne reçoit aucun accès automatique aux données privées santé d'un client.
- Les fichiers médicaux complets devront continuer à passer par une route serveur privée avec validation MIME/taille et stockage contrôlé.
- Les notes et détails médicaux restent sensibles; l'interface affiche un niveau de confidentialité et les routes doivent rester le point de contrôle principal.

## Limites restantes

- Patients, Rendez-vous, Consultations, Dossiers médicaux, Équipe médicale, Laboratoire et Pharmacie interne utilisent désormais des tables dédiées. Les autres modules Santé utilisent encore `EnterpriseSectorRecord`; les modules dédiés conservent temporairement un miroir `legacyRecordId` pour leur compatibilité.
- L’inventaire complet multi-produits, l’annulation par mouvement inverse, le fournisseur structuré et la création de lignes de Facturation médicale restent des évolutions futures. Les ajustements persistants et le statut `TO_BILL` couvrent le périmètre actuel sans bouton fictif.
- Les disponibilités habituelles sont persistées dans l’affectation principale; la gestion détaillée de créneaux exceptionnels par jour reste une évolution future.
- Le fichier de résultat, la facturation d’examens et l’export PDF ne sont pas exposés tant que leurs routes privées dédiées ne sont pas disponibles.
- Les demandes laboratoire, factures et documents médicaux liés à une consultation restent génériques; aucun bouton n’est affiché tant que leur workflow dédié n’est pas disponible.
- Les disponibilités détaillées des professionnels ne sont pas encore reliées automatiquement aux créneaux Rendez-vous ; le planning affiche les créneaux persistés mais ne bloque pas encore les chevauchements.
- Les références de documents médicaux sont persistées, mais l'upload fichier médical complet doit être relié à une route de stockage privée dédiée avant d'autoriser le dépôt direct.
- Les permissions recommandées par poste santé sont persistées dans `EnterprisePosition.permissionsJson`, mais `OrganizationMember` n’est pas encore relié directement à `EnterprisePosition`. Le backend applique donc actuellement les droits effectifs selon le membership et le rôle entreprise, avec données sensibles réservées aux rôles gestionnaires.
- L'acceptation/refus d'invitation côté invité utilise le statut `OrganizationMember`; l'interface d'acceptation peut être enrichie dans une prochaine itération si un écran dédié aux invitations est ajouté.
