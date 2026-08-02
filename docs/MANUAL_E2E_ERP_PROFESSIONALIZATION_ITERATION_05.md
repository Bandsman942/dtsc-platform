# Campagne E2E manuelle — Professionnalisation ERP, itération 5

## Statut global

**Tests E2E manuels préparés — validation du propriétaire en attente.**

- Testeur attendu : propriétaire de DTSC Platform
- Environnement cible : Production issue de `main`
- Statuts autorisés : `NON_EXÉCUTÉ`, `RÉUSSI`, `ÉCHOUÉ`, `BLOQUÉ`
- Statut initial de tous les scénarios : `NON_EXÉCUTÉ`

Ne jamais remplacer ce statut global par « Tests E2E réussis » sans confirmation explicite du propriétaire.

## Comptes et rôles nécessaires

- un comptable préparateur ;
- un approbateur comptable distinct ;
- un responsable Finance ;
- un manager sans permission Finance ;
- un utilisateur global lié à l’entreprise mais non membre Finance ;
- une entreprise cliente avec Finance activée.

---

## E2E-05-001 — Plan comptable

| Champ | Valeur |
|---|---|
| Module | Comptabilité |
| Objectif | Vérifier création, hiérarchie, protection d’un compte utilisé et désactivation |
| Entreprise | À renseigner |
| Compte / rôle | Responsable Finance |
| Préconditions | Devise fonctionnelle et module Comptabilité actifs |
| Étapes | Créer un plan ; créer un compte parent ; créer un sous-compte ; utiliser le sous-compte dans une écriture ; tenter de le supprimer ; vérifier le refus ; le désactiver |
| Résultat attendu | Hiérarchie cohérente, compte utilisé non supprimable, désactivation conservant l’historique |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | À renseigner |
| Observations / capture / ticket | À renseigner |

## E2E-05-002 — Écriture manuelle et contrepassation

| Champ | Valeur |
|---|---|
| Module | Comptabilité |
| Objectif | Vérifier partie double, approbation indépendante, immutabilité et contrepassation |
| Entreprise | À renseigner |
| Compte / rôle | Comptable puis approbateur distinct |
| Préconditions | Journal et période ouverte disponibles |
| Étapes | Créer une écriture équilibrée ; soumettre ; approuver avec une autre personne ; comptabiliser ; tenter de modifier ; vérifier le refus ; contrepasser avec une date autorisée et un motif |
| Résultat attendu | Écriture comptabilisée immuable, écriture inversée reliée à l’original, aucune suppression historique |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | À renseigner |
| Observations / capture / ticket | À renseigner |

## E2E-05-003 — Refus d’une écriture déséquilibrée

| Champ | Valeur |
|---|---|
| Module | Comptabilité |
| Objectif | Vérifier l’autorité serveur sur l’équilibre débit/crédit |
| Entreprise | À renseigner |
| Compte / rôle | Comptable |
| Préconditions | Journal et période ouverte |
| Étapes | Soumettre une écriture dont les montants débit et crédit diffèrent, y compris en manipulant la requête |
| Résultat attendu | Refus explicite ; aucune écriture comptabilisée ; message métier compréhensible |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | À renseigner |
| Observations / capture / ticket | À renseigner |

## E2E-05-004 — Comptabilisation automatique idempotente

| Champ | Valeur |
|---|---|
| Module | Comptabilité et opérations |
| Objectif | Vérifier une écriture unique par événement métier |
| Entreprise | À renseigner |
| Compte / rôle | Utilisateurs autorisés des modules sources et Finance |
| Préconditions | Mappings actifs et période ouverte |
| Étapes | Émettre une facture client et relancer l’action ; répéter avec facture fournisseur, paiement, paie, mouvement de stock et amortissement |
| Résultat attendu | Une seule écriture par source/version ; les retries retrouvent l’existant |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | À renseigner |
| Observations / capture / ticket | À renseigner |

## E2E-05-005 — Fiscalité et taux à date d’effet

| Champ | Valeur |
|---|---|
| Module | Fiscalité |
| Objectif | Vérifier l’historisation des taux |
| Entreprise | À renseigner |
| Compte / rôle | Responsable Finance |
| Préconditions | Comptes fiscaux disponibles |
| Étapes | Créer un code fiscal ; créer un taux avec date d’effet ; l’utiliser dans une facture ; créer un nouveau taux ultérieur ; rouvrir l’ancienne facture |
| Résultat attendu | L’ancienne facture conserve l’ancien taux ; la nouvelle utilise le taux applicable |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | À renseigner |
| Observations / capture / ticket | À renseigner |

## E2E-05-006 — Clôture financière

| Champ | Valeur |
|---|---|
| Module | Clôture financière |
| Objectif | Vérifier checklist, blocages, approbation et protection de période |
| Entreprise | À renseigner |
| Compte / rôle | Préparateur puis approbateur distinct |
| Préconditions | Période ouverte contenant des opérations de test |
| Étapes | Préparer la clôture ; examiner les blocages ; corriger les anomalies ; soumettre ; approuver ; fermer ; tenter une mutation comptable |
| Résultat attendu | Blocages explicites et actionnables ; fermeture réussie seulement après correction ; mutation refusée après fermeture |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | À renseigner |
| Observations / capture / ticket | À renseigner |

## E2E-05-007 — Réouverture contrôlée

| Champ | Valeur |
|---|---|
| Module | Clôture financière |
| Objectif | Vérifier motif, permission, acteur indépendant et audit |
| Entreprise | À renseigner |
| Compte / rôle | Responsable Finance autorisé, distinct des acteurs précédents |
| Préconditions | Période fermée |
| Étapes | Demander la réouverture ; saisir un motif ; faire approuver selon la politique ; réouvrir ; passer une écriture d’ajustement ; refermer ; consulter l’historique |
| Résultat attendu | Réouverture auditée ; aucune suppression des écritures ou versions publiées ; période refermée correctement |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | À renseigner |
| Observations / capture / ticket | À renseigner |

## E2E-05-008 — États financiers et publication

| Champ | Valeur |
|---|---|
| Module | États financiers |
| Objectif | Vérifier génération, équilibre, publication et immutabilité |
| Entreprise | À renseigner |
| Compte / rôle | Responsable Finance |
| Préconditions | Écritures comptabilisées dans la période |
| Étapes | Générer la balance ; vérifier débit = crédit ; générer résultat et bilan ; générer flux lorsque supporté ; publier ; ajouter une opération autorisée à une période non fermée ; rouvrir la version publiée ; exporter |
| Résultat attendu | Aperçu dynamique recalculable ; version publiée inchangée et identifiable ; permissions d’export respectées |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | À renseigner |
| Observations / capture / ticket | À renseigner |

## E2E-05-009 — Immobilisation et amortissement

| Champ | Valeur |
|---|---|
| Module | Immobilisations |
| Objectif | Vérifier séparation actif opérationnel / immobilisation et idempotence |
| Entreprise | À renseigner |
| Compte / rôle | Responsable Finance |
| Préconditions | Actif opérationnel non capitalisé et comptes d’immobilisation configurés |
| Étapes | Sélectionner l’actif ; le capitaliser ; vérifier le plan linéaire ; exécuter la dotation ; vérifier l’écriture ; relancer la même exécution |
| Résultat attendu | Actif opérationnel conservé ; une seule dotation par période ; valeur nette mise à jour ; écriture traçable |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | À renseigner |
| Observations / capture / ticket | À renseigner |

## E2E-05-010 — Valorisation du stock

| Champ | Valeur |
|---|---|
| Module | Valorisation du stock |
| Objectif | Vérifier coût moyen pondéré, anomalies et publication |
| Entreprise | À renseigner |
| Compte / rôle | Responsable Finance et responsable Stock |
| Préconditions | Réceptions et sorties de stock réelles avec coûts disponibles |
| Étapes | Vérifier les mouvements ; consulter quantité, coût moyen et valeur ; provoquer une sortie supérieure aux couches disponibles ; vérifier le blocage ; publier une version de valorisation |
| Résultat attendu | Valeur cohérente ; stock comptable négatif refusé ; stock physique non modifié par la consultation ; version publiée immuable |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | À renseigner |
| Observations / capture / ticket | À renseigner |

## E2E-05-011 — Permissions Finance

| Champ | Valeur |
|---|---|
| Module | Tous les modules de l’itération 5 |
| Objectif | Vérifier absence d’élévation de privilèges |
| Entreprise | À renseigner |
| Comptes / rôles | Comptable, approbateur, responsable Finance, manager sans Finance, relation globale non membre |
| Préconditions | Comptes de test disponibles |
| Étapes | Tester lecture, création, approbation, posting, clôture, réouverture, publication et export avec chaque rôle ; tenter de modifier `organizationId` et les identifiants d’objet |
| Résultat attendu | Accès strictement conforme ; aucun IDOR ; manager ou relation active ne devient pas automatiquement responsable Finance |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | À renseigner |
| Observations / capture / ticket | À renseigner |

## E2E-05-012 — Relations avec les entreprises

| Champ | Valeur |
|---|---|
| Module | Relations avec les entreprises |
| Objectif | Vérifier la non-régression de la navigation globale |
| Entreprise | Aucune entreprise active puis entreprise de test |
| Compte / rôle | Utilisateur global |
| Préconditions | Relation/invitation disponible |
| Étapes | Vérifier présence desktop et mobile ; ouvrir sans entreprise active ; vérifier état actif et badge ; ouvrir depuis une notification ; tenter d’accéder à Finance par la relation seule |
| Résultat attendu | Module visible et fonctionnel ; liens profonds corrects ; aucun accès Finance automatique |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | À renseigner |
| Observations / capture / ticket | À renseigner |

## E2E-05-013 — Mobile et français

| Champ | Valeur |
|---|---|
| Module | Tous les modules de l’itération 5 |
| Objectif | Vérifier l’usage réel sur téléphone |
| Entreprise | À renseigner |
| Compte / rôle | Comptable et responsable Finance |
| Préconditions | Tester à 320, 360, 390 et 412 px |
| Étapes | Parcourir les KPI ; créer une écriture ; utiliser la checklist de clôture ; ouvrir un état ; capitaliser un actif ; consulter une valorisation ; vérifier formulaires et clavier |
| Résultat attendu | KPI horizontalement défilables ; aucun UUID, enum brute ou texte anglais en locale française ; aucun débordement ; actions et retours accessibles |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | À renseigner |
| Observations / capture / ticket | À renseigner |

---

## Résultat final à renseigner par le propriétaire

- Nombre réussi : À renseigner
- Nombre échoué : À renseigner
- Nombre bloqué : À renseigner
- Anomalies critiques : À renseigner
- Décision de promotion commerciale par module : À renseigner

Tant que cette section n’est pas explicitement complétée par le propriétaire, les modules restent `PROFESSIONAL_READY` et non commercialisables.
