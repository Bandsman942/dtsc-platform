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

## Migrations

- `20260528100000_enterprise_sector_records`: ajoute `EnterpriseSectorRecord`.
- `20260528133000_healthcare_sector_iteration`: enrichit le template `HEALTH_CARE`, les organisations santé existantes et les blocs Activités santé avec documents médicaux, paramètres santé, rapports santé, signalement laboratoire, rupture pharmacie et dépôt de document patient.

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

Routes:

- `GET /api/enterprise/[organizationId]/healthcare`;
- `POST /api/enterprise/[organizationId]/healthcare`;
- `PATCH /api/enterprise/[organizationId]/healthcare/[recordId]`;
- `DELETE /api/enterprise/[organizationId]/healthcare/[recordId]`.

Chaque route vérifie la session, le membership actif, l'organisation cliente active, `sectorCode = HEALTH_CARE`, le module entreprise activé, la validation Zod, le rate limiting et l'audit.

## Actions métier

Les actions visibles dans les menus `...` sont persistées:

- rendez-vous: confirmer, annuler, marquer absent, convertir en consultation;
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

Les formulaires santé ajoutent des champs contextualisés dans la description persistée, sans exposer les sous-modules sensibles aux collaborateurs non autorisés.

## Postes et permissions

Permissions recommandées:

- Médecin: patients en lecture, consultations, dossiers médicaux autorisés, demandes laboratoire, documents médicaux.
- Réceptionniste: patients administratifs limités, rendez-vous, facturation limitée.
- Laborantin: laboratoire, résultats, patients en lecture limitée.
- Pharmacien: pharmacie interne, mouvements de stock, patients en lecture limitée.
- Caissier médical: facturation médicale, patients administratifs limités.
- Responsable qualité: incidents qualité, rapports, alertes.
- Directeur médical / admin entreprise: supervision santé selon rôle organisationnel.

Le backend applique les contrôles via `canAccessEnterpriseModule()` et les sous-modules documents, confidentialité, paramètres et rapports sont rattachés respectivement aux modules `MEDICAL_RECORDS`, `SETTINGS` ou `REPORTS` pour la vérification d'accès.

## Confidentialité

- Une donnée santé appartient toujours à une seule entreprise.
- DTSC global ne reçoit aucun accès automatique aux données privées santé d'un client.
- Les fichiers médicaux complets devront continuer à passer par une route serveur privée avec validation MIME/taille et stockage contrôlé.
- Les notes et détails médicaux restent sensibles; l'interface affiche un niveau de confidentialité et les routes doivent rester le point de contrôle principal.

## Limites restantes

- Cette itération utilise `EnterpriseSectorRecord` comme stockage sectoriel générique; des tables dédiées peuvent être ajoutées plus tard pour des besoins médicaux avancés.
- Les références de documents médicaux sont persistées, mais l'upload fichier médical complet doit être relié à une route de stockage privée dédiée avant d'autoriser le dépôt direct.
- Les permissions fines par poste santé sont préparées côté modèle et documentation; elles devront être renforcées par une matrice dédiée si l'entreprise active des dossiers médicaux très sensibles.
