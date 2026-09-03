# Changelog — Hotfix RH, temps/présences/congés et paie (#562)

Date : 2026-09-03

Baseline : `main@c2f26a53a46004a5bb9cfae3063bc80cdd654ac7`

## Corrigé

- alignement du module Ressources humaines sur les référentiels canoniques de postes, départements, sites, responsables et membres de la même organisation ;
- dérivation serveur du code de poste depuis `EnterprisePosition` au lieu d’accepter un intitulé libre comme autorité RH ;
- contrôles tenant-scoped renforcés sur les contrats, affectations et relations RH ;
- interdiction stricte de l’auto-approbation pour RH, Temps et Paie ;
- séparation explicite entre horaire planifié, présence observée, congé/absence, temps déclaré et temps approuvé ;
- exposition des horaires planifiés et présences observées dans le workspace Temps avec routes métier dédiées ;
- prévention des chevauchements d’horaires, doublons de présence et conflits entre présence et congé approuvé ;
- annulation contrôlée des congés avec motif, révision et audit, sans suppression d’historique ;
- validation tenant-scoped des références de feuilles de temps vers projets, tâches, jalons, livrables, contrats, tiers et catalogue ;
- recalcul serveur des durées lorsque des heures de début/fin sont fournies ;
- couverture de paie calculée à partir des lignes de temps approuvées réellement comprises dans la période, y compris lorsqu’une feuille chevauche deux périodes ;
- justification obligatoire des primes et retenues non nulles ;
- séparation maintenue entre rémunération contractuelle et preuve de temps approuvé : aucune proratisation automatique du salaire ;
- séparation maintenue entre paie approuvée et paiement effectué : l’approbation génère les bulletins, le décaissement reste dans Finance ;
- durcissement du paiement de paie : paie approuvée obligatoire, direction sortante, devise identique, aucune contrepartie ambiguë et montant cumulé plafonné au net restant ;
- les paiements de paie ne créent pas de solde d’allocation client/fournisseur concurrent.

## UX

- formulaires RH, Temps et Paie alignés sur le mode `editor` mobile-first ;
- sélecteurs métier tenant-scoped à la place d’identifiants techniques ;
- pagination et filtres des listes ;
- revue explicite avant approbation, rejet et annulation ;
- motifs de rejet/annulation conservés ;
- feedback par toast et états disabled/loading sur les mutations sensibles ;
- lien explicite d’une paie approuvée vers `FINANCE_PAYMENTS` sans automatiser le décaissement.

## Sécurité et intégrité

- session, membership, module, entitlement et permission restent résolus par les services canoniques ;
- same-origin, Zod, rate limit, transactions et audit conservés sur les mutations ;
- toutes les références client ajoutées par le hotfix sont revalidées dans le même `organizationId` ;
- aucune migration Prisma n’est introduite : les modèles horaires et présence existaient déjà dans le schéma canonique ;
- aucun dual-write et aucune nouvelle source de vérité ne sont ajoutés.

## QA

La QA permanente `qa:enterprise-hr-payroll` couvre désormais les frontières RH → Temps → Paie → Finance, les nouvelles routes horaires/présence/annulation, l’interdiction d’auto-approbation, les références tenant-scoped et la limite du paiement de paie.

Les états de preuve restent ceux de la PR #562 : aucune commande ou E2E n’est considérée réussie sans exécution CI ou confirmation explicite du propriétaire.
