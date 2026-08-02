# Campagne E2E manuelle finale — Programme de professionnalisation ERP

**Date de préparation :** 3 août 2026  
**Environnement d’exécution :** Vercel Production correspondant au SHA de `main`  
**Testeur attendu :** propriétaire de DTSC Platform  
**Statut global :** NON_EXÉCUTÉ

> **Tests E2E manuels préparés — validation du propriétaire en attente.**

Ce document consolide la validation finale des itérations 1 à 6. Les campagnes détaillées de chaque itération restent les références d’exécution. Aucun statut `COMMERCIAL_READY` n’est accordé par ce document seul.

## Règle de preuve

Pour chaque scénario, renseigner :

- Résultat réel ;
- statut `NON_EXÉCUTÉ`, `RÉUSSI`, `ÉCHOUÉ` ou `BLOQUÉ` ;
- date ;
- testeur ;
- observations ;
- captures ;
- Ticket correctif.

## F-001 — Registre, plans, navigation et modules masqués

| Champ | Contenu |
|---|---|
| Identifiant | F-001 |
| Module | Registre canonique / navigation / plans |
| Secteur | Transversal |
| Objectif | Vérifier que seuls les modules réellement actifs, autorisés et inclus dans le plan sont visibles |
| Entreprise | Entreprise Core, Health et Pharmacy |
| Compte | Admin entreprise puis utilisateur standard |
| Rôle | Admin / membre |
| Préconditions | Plans et entitlements configurés |
| Étapes | Comparer le registre, l’administration, desktop, mobile et les routes directes ; tester les aliases et modules HIDDEN/PLANNED |
| Résultat attendu | Ordre et icônes canoniques ; aliases redirigés ; modules fantômes absents ; accès direct refusé |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | Propriétaire DTSC Platform |
| Observations | À renseigner |
| Captures | À joindre |
| Ticket correctif | Aucun tant que non exécuté |

## F-002 — Référentiels, CRM, contrats et identité relationnelle

| Champ | Contenu |
|---|---|
| Identifiant | F-002 |
| Module | Tiers / CRM / Contrats / Relations avec les entreprises |
| Secteur | Core |
| Objectif | Valider le cycle commercial et le consentement |
| Entreprise | Entreprise Core de test |
| Compte | Commercial, validateur, utilisateur global |
| Rôle | Commercial / validateur / utilisateur standard |
| Préconditions | Données de test disponibles |
| Étapes | Créer tiers, prospect, opportunité, contrat, document, soumettre, approuver/refuser/corriger ; proposer et accepter une liaison ; révoquer |
| Résultat attendu | Workflows séparés, documents réels, commentaires auditables, relation consentie, aucun accès excessif |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | Propriétaire DTSC Platform |
| Observations | À renseigner |
| Captures | À joindre |
| Ticket correctif | Aucun tant que non exécuté |

## F-003 — Ventes, achats et stock commun

| Champ | Contenu |
|---|---|
| Identifiant | F-003 |
| Module | Ventes / Achats / Stock |
| Secteur | Core |
| Objectif | Vérifier les chaînes opérationnelles et l’idempotence |
| Entreprise | Entreprise Core de test |
| Compte | Ventes, achats, stock, validateurs |
| Rôle | Plusieurs rôles |
| Préconditions | Catalogue, client, fournisseur et entrepôt disponibles |
| Étapes | Devis → commande → livraison ; commande fournisseur → réception ; transfert ; inventaire ; ajustement ; répéter une requête sensible |
| Résultat attendu | Aucun double mouvement, livraison ou réception ; stock négatif interdit selon règle ; historique intact |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | Propriétaire DTSC Platform |
| Observations | À renseigner |
| Captures | À joindre |
| Ticket correctif | Aucun tant que non exécuté |

## F-004 — RH, temps, paie, projets et actifs

| Champ | Contenu |
|---|---|
| Identifiant | F-004 |
| Module | RH / Congés / Temps / Paie / Projets / Actifs |
| Secteur | Core |
| Objectif | Vérifier les workflows, la confidentialité et la séparation des responsabilités |
| Entreprise | Entreprise Core de test |
| Compte | RH, collaborateur, manager, approbateur |
| Rôle | Plusieurs rôles |
| Préconditions | Collaborateurs, projet et actif disponibles |
| Étapes | Créer dossier RH, congé, timesheet, paie, livrable, affectation et incident ; soumettre et approuver avec utilisateurs distincts |
| Résultat attendu | Aucun auto-approbation interdite ; paie distincte du paiement ; salaires privés ; historiques conservés |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | Propriétaire DTSC Platform |
| Observations | À renseigner |
| Captures | À joindre |
| Ticket correctif | Aucun tant que non exécuté |

## F-005 — Finance opérationnelle

| Champ | Contenu |
|---|---|
| Identifiant | F-005 |
| Module | Créances / Dettes / Paiements / Trésorerie / Caisse / Banque / Rapprochement |
| Secteur | Finance |
| Objectif | Vérifier l’unicité des objets financiers et les allocations |
| Entreprise | Entreprise Finance de test |
| Compte | Préparateur, approbateur, caissier, validateur |
| Rôle | Finance |
| Préconditions | Période ouverte, comptes et tiers configurés |
| Étapes | Créer facture client et fournisseur, paiement non affecté, allocation, transfert, caisse, import bancaire et rapprochement |
| Résultat attendu | Aucune double facture/paiement/allocation ; séparation des responsabilités ; rapprochement traçable |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | Propriétaire DTSC Platform |
| Observations | À renseigner |
| Captures | À joindre |
| Ticket correctif | Aucun tant que non exécuté |

## F-006 — Comptabilité, fiscalité, clôture et états

| Champ | Contenu |
|---|---|
| Identifiant | F-006 |
| Module | Comptabilité / Fiscalité / Clôture / États / Immobilisations / Valorisation |
| Secteur | Finance |
| Objectif | Vérifier partie double, immutabilité et publication |
| Entreprise | Entreprise Finance de test |
| Compte | Comptable, approbateur, clôture |
| Rôle | Finance avancée |
| Préconditions | Plan comptable, journaux et périodes configurés |
| Étapes | Créer et comptabiliser une écriture, contrepasser, clôturer une période, publier des états, capitaliser un actif, valoriser le stock |
| Résultat attendu | Débits = crédits ; écriture POSTED immuable ; période fermée protégée ; snapshots publiés immuables |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | Propriétaire DTSC Platform |
| Observations | À renseigner |
| Captures | À joindre |
| Ticket correctif | Aucun tant que non exécuté |

## F-007 — Health complet

| Champ | Contenu |
|---|---|
| Identifiant | F-007 |
| Module | Tous modules Health actifs |
| Secteur | Health |
| Objectif | Exécuter et consolider I06-H-001 à I06-H-005 |
| Entreprise | Entreprise Health de test |
| Compte | Rôles Health et Finance |
| Rôle | Plusieurs rôles |
| Préconditions | Voir campagne itération 6 |
| Étapes | Exécuter les scénarios Health de `MANUAL_E2E_ERP_PROFESSIONALIZATION_ITERATION_06.md` |
| Résultat attendu | Tous les scénarios Health réussis sans fuite clinique ni double objet financier |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | Propriétaire DTSC Platform |
| Observations | À renseigner |
| Captures | À joindre |
| Ticket correctif | Aucun tant que non exécuté |

## F-008 — Pharmacy complet

| Champ | Contenu |
|---|---|
| Identifiant | F-008 |
| Module | Tous modules Pharmacy actifs |
| Secteur | Pharmacy |
| Objectif | Exécuter et consolider I06-P-001 à I06-P-006 |
| Entreprise | Entreprise Pharmacy de test |
| Compte | Rôles Pharmacy et Finance |
| Rôle | Plusieurs rôles |
| Préconditions | Voir campagne itération 6 |
| Étapes | Exécuter les scénarios Pharmacy de `MANUAL_E2E_ERP_PROFESSIONALIZATION_ITERATION_06.md` |
| Résultat attendu | Tous les scénarios Pharmacy réussis ; FEFO et blocages effectifs ; aucune duplication financière ou de stock |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | Propriétaire DTSC Platform |
| Observations | À renseigner |
| Captures | À joindre |
| Ticket correctif | Aucun tant que non exécuté |

## F-009 — Mobile, français, documents, notifications et sécurité

| Champ | Contenu |
|---|---|
| Identifiant | F-009 |
| Module | Transversal |
| Secteur | Tous |
| Objectif | Vérifier les contrats UX et sécurité finaux |
| Entreprise | Core, Health, Pharmacy |
| Compte | Plusieurs rôles et autre tenant |
| Rôle | Plusieurs rôles |
| Préconditions | Données et notifications disponibles |
| Étapes | Tester 320/360/390/412 px, tablette et desktop ; uploads/téléchargements ; commentaires ; notifications ; liens profonds ; erreurs ; accès inter-tenant ; révocations |
| Résultat attendu | Aucun overflow, UUID, enum brute ou anglais en français ; documents privés ; notifications génériques ; refus serveur cohérents |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | Propriétaire DTSC Platform |
| Observations | À renseigner |
| Captures | À joindre |
| Ticket correctif | Aucun tant que non exécuté |

## F-010 — Production et observabilité

| Champ | Contenu |
|---|---|
| Identifiant | F-010 |
| Module | Production |
| Secteur | Transversal |
| Objectif | Confirmer le SHA, les migrations, le démarrage et l’absence d’incident critique |
| Entreprise | Toutes |
| Compte | Propriétaire / admin autorisé |
| Rôle | Propriétaire |
| Préconditions | PR fusionnée, déploiement unique terminé |
| Étapes | Vérifier SHA PR, SHA fusionné, SHA main, SHA Production, migrations, build, authentification, tenant, modules, documents, logs et métriques critiques |
| Résultat attendu | SHA Production = main ; migrations et démarrage réussis ; aucun incident critique non traité |
| Résultat réel | À renseigner |
| Statut | NON_EXÉCUTÉ |
| Date | À renseigner |
| Testeur | Propriétaire DTSC Platform |
| Observations | À renseigner |
| Captures | À joindre |
| Ticket correctif | Aucun tant que non exécuté |

## Décision de clôture

Le programme ne peut être déclaré fonctionnellement et commercialement clôturé que lorsque :

1. tous les scénarios applicables sont `RÉUSSI` ;
2. les défauts critiques sont corrigés et retestés ;
3. les preuves sont jointes ;
4. le propriétaire confirme explicitement la campagne ;
5. une PR séparée promeut la liste précise des modules validés vers `COMMERCIAL_READY`.
