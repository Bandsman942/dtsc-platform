# Maturité commerciale ERP — DTSC Platform

Version : 5
Évaluation courante : 2 août 2026

## Sources exécutables

- Registre canonique : `lib/enterprise/module-registry*.json` et `module-registry.ts`.
- Évaluation produit de base : `lib/enterprise/module-commercial-readiness.json`.
- Compléments : `lib/enterprise/module-commercial-readiness-iteration-03.json`, `iteration-04.json` et `iteration-05.json`.
- Résolution typée fusionnée : `lib/enterprise/module-commercial-readiness.ts`.
- Contrôles CI : `scripts/qa-erp-commercial-readiness-checks.mjs`, `scripts/qa-erp-professional-iteration-03-checks.mjs`, `scripts/qa-erp-professional-iteration-04-finance-checks.mjs` et `scripts/qa-erp-professional-iteration-05-accounting-checks.mjs`.
- Visualisation autorisée : `/admin/erp-readiness`.

La matrice affichée dans l’administration est calculée à partir de ces sources. Ce document explique la politique ; il ne remplace pas le manifeste exécutable.

## Lecture de la matrice

Pour chaque module, l’administration expose :

- le libellé commercial français ;
- le code technique en information secondaire ;
- le statut technique ;
- la maturité commerciale ;
- la route et le workspace lorsqu’ils existent ;
- le plan minimal ;
- les dépendances ;
- les critères validés et manquants ;
- le contrat QA ;
- les preuves ;
- l’itération suivante ;
- la date d’évaluation ;
- la commercialisabilité.

## Politique prudente

Aucune promotion automatique vers `COMMERCIAL_READY` n’est autorisée.

Les modules sans preuve produit dédiée reçoivent une évaluation conservatrice. Les modules masqués, planifiés ou retirés restent `BACKEND_READY`. Une section d’administration consolidée peut être `PROFESSIONAL_READY` sans être vendue comme module autonome.

`COMMERCIAL_READY` exige simultanément :

- un parcours métier complet ;
- des formulaires, détails et actions réellement accessibles aux rôles autorisés ;
- des workflows de soumission, validation, correction et refus reliés au validateur assigné ;
- du français commercial et une internationalisation maîtrisée ;
- une expérience mobile sans chevauchement ni mot cassé ;
- des rails et filtres tactiles fonctionnels ;
- des permissions serveur, l’isolation tenant et un audit ;
- une documentation et un guide dédié ;
- l’observabilité et des QA opposables ;
- un packaging commercial ;
- une décision explicite du propriétaire fondée sur sa validation fonctionnelle et la fermeture des défauts remontés ;
- une Production stable issue uniquement de `main`.

Les tests automatisés verts ne remplacent jamais une campagne E2E authentifiée. Inversement, une campagne manuelle ne permet pas de masquer un Quality Gate en échec.

## Réévaluation de l’itération 2

Les modules ciblés disposent de workspaces dédiés, formulaires, détails, actions, onboarding, aide, documentation, mobile et QA ciblée. Leur promotion finale reste individuelle et dépend des contrôles CI, des scénarios navigateur authentifiés et des smoke tests Production.

## Réévaluation et promotion de l’itération 3

Le propriétaire a exécuté une campagne manuelle initiale en Production. Cette campagne a confirmé les chaînes métier principales, mais a également révélé des défauts transversaux : rails tactiles bloqués, filtres chevauchés, lignes mobiles trop étroites, formulaires difficiles à découvrir, workflow du validateur de contrat incomplet, documents contractuels sans téléversement guidé, guides non contextualisés, Support non surligné et messages vocaux insuffisamment robustes.

La PR de durcissement commercial ferme ces défauts et ajoute des contrôles CI spécifiques. Sur décision explicite du propriétaire, les modules suivants sont évalués `COMMERCIAL_READY` et `commercializable: true` : ventes, achats, stock, RH, temps, paie, projets, livrables et actifs opérationnels.

La promotion commerciale n’affirme pas qu’une nouvelle campagne manuelle post-correctif a déjà été exécutée. Le plan de smoke tests post-déploiement reste conservé dans `docs/MANUAL_E2E_ERP_PROFESSIONALIZATION_ITERATION_03.md` et doit recevoir des résultats réels du propriétaire.

## Réévaluation de l’itération 4

La Finance opérationnelle est évaluée module par module à partir de ses workspaces dédiés, guides utilisateur, contrôles d’intégrité, permissions, documents et QA. Toute promotion commerciale repose sur la confirmation explicite du propriétaire et ne s’étend jamais automatiquement aux modules comptables avancés.

## Réévaluation de l’itération 5

Les six modules avancés suivants disposent désormais d’une expérience dédiée et sont évalués `PROFESSIONAL_READY` :

| Module | Preuves principales | Limites honnêtes |
|---|---|---|
| `FINANCE_ACCOUNTING` | plan comptable, exercices, périodes, journaux, écritures équilibrées, grand livre, balance, règles, anomalies et contrepassations | validation E2E et Production en attente |
| `FINANCE_TAX` | codes fiscaux, comptes et taux historisés par date d’effet | aucune promesse de déclaration légale universelle |
| `FINANCE_CLOSE` | checklist, blocages, approbation, fermeture et réouverture motivée | récupération et smoke tests à confirmer |
| `FINANCE_STATEMENTS` | aperçus, bilan, résultat, balance, grand livre et snapshots publiés immuables | formats d’export à valider manuellement |
| `FINANCE_ASSETS` | capitalisation contrôlée, registre, plan linéaire et exécution idempotente | seules les méthodes réellement supportées sont exposées |
| `FINANCE_INVENTORY` | coût moyen pondéré, couches de coût, blocage du stock négatif comptable et publication | aucune méthode FIFO ou standard fictive |

Pour ces six modules :

- `commercializable` reste `false` ;
- le critère `owner-authenticated-manual-e2e-validation` reste manquant ;
- le document `docs/MANUAL_E2E_ERP_PROFESSIONALIZATION_ITERATION_05.md` conserve tous les scénarios à `NON_EXÉCUTÉ` ;
- aucune promotion groupée n’est permise ;
- une simple relation active avec l’entreprise ne donne aucun accès Finance.

**Tests E2E manuels préparés — validation du propriétaire en attente.**

## Anomalies bloquantes

Le contrôle CI échoue notamment si :

- un module commercialisable utilise une interface générique ou non vérifiée ;
- un module `COMMERCIAL_READY` n’a pas d’override explicite ;
- la route ou le workspace manque ;
- une écriture existe sans formulaire prouvé ;
- le détail ou les actions métier manquent ;
- les permissions, l’audit, l’i18n, le responsive ou la QA manquent ;
- un rail tactile ne dispose plus de son contrat de défilement ;
- une ligne métier peut de nouveau réduire son titre à une colonne illisible ;
- un validateur assigné ne peut plus décider l’objet soumis ;
- un commentaire de workflow devient modifiable par un autre auteur ;
- un document lié ne peut plus recevoir un fichier privé versionné ;
- un guide pointe vers un module différent ;
- le microphone échoue sans message actionnable ;
- les accusés de messagerie ne distinguent plus envoi, réception et lecture ;
- une écriture comptabilisée devient modifiable ;
- une contrepassation n’est plus reliée à l’original ;
- une période fermée accepte une mutation interdite ;
- une règle ou un taux réécrit l’historique ;
- un amortissement ou une valorisation peut être dupliqué ;
- un état publié devient modifiable ;
- un UUID ou une enum brute réapparaît dans une interface Finance ;
- un rapport déclare les tests E2E réussis sans preuve du propriétaire.

## Maintenance

Toute itération de professionnalisation doit :

1. fermer uniquement les critères réellement traités ;
2. ajouter les preuves correspondantes ;
3. laisser visibles les lacunes restantes ;
4. exécuter les QA du domaine et le contrôle de maturité ;
5. faire relire la promotion par produit et technique ;
6. déclasser immédiatement un module lorsqu’une preuve majeure n’est plus vraie.

Le statut `ACTIVE` demeure un statut technique. Il ne doit jamais être réutilisé comme argument commercial.
