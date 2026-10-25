# Hotfix #906 — Fidélité relationnelle Retail POS canonique

Issue : [#906](https://github.com/Bandsman942/dtsc-platform/issues/906). Sous-lot du programme parent #886 / #785. Branche dédiée `fix/906-retail-relationship-loyalty` depuis `main@b105ab3b` ; **pas encore fusionnée**. Le contrôle utilisateur `OWNER_E2E` et les contrôles de GitHub CI sont obligatoires avant toute fusion et mise en production.

## Décision produit du 25 octobre 2026

- `LOYALTY` : points proportionnels au **montant réellement vendu**, après remises et taxes, avec un taux explicite en points par unité de devise.
- `CASHBACK` : futur crédit magasin géré par le registre canonique `EnterpriseRetailStoredValueAccount` / `EnterpriseRetailStoredValueEntry`, **non livré ici**.
- `CREDIT` : futur crédit magasin utilisant **le même registre Stored Value**, sans second livre de comptes, **non livré ici**.
- Les points ne sont **pas** une créance monétaire, un paiement ou un cashback. Aucune conversion automatique en argent.

## Fonctionnement livré en branche

1. L'entreprise Retail configure un programme **actif**, avec devise explicite et `autoEarn: false`, dans le module canonique de fidélité. Le formulaire d'administration des avantages permet de choisir `LOYALTY` et ce programme, avec taux `POINTS` strictement positif, cible `RETAIL_POS`, action `NONE`, cumul activé. Le serveur revalide le programme, le tenant, la devise et le droit du module ; un programme doté d'un autre gain automatique est refusé pour éviter un double crédit.
2. Une vente POS confirmée, rattachée à un tiers client et à une **relation consentie active**, résout l'audience, les conditions, les attributions et le quota côté serveur. Les prix sont ceux de la vente **après** calcul commercial. La vente n'est pas enrichie de points si le prix fait l'objet d'une dérogation manuelle à la grille commerciale.
3. Dans la transaction sérialisable de la vente, le serveur vérifie à nouveau l'éligibilité, l'attachement de la personne au tiers, le montant au cent-millième, la devise, le programme, le quota et le module. Un verrou de quota + un verrou sur le compte garantissent l'unicité. Il écrit **une** entrée `EnterpriseRetailLoyaltyEntry/EARN` et **une** `EnterpriseRelationshipBenefitUsage/CONSUMED` avec la même clé économique de vente et avantage. Aucun versement ni mutation financière simulés.
4. Un rejeu de la même vente garde la même attribution de points et n'ajoute aucune écriture. Une collision de clé avec un autre contexte est refusée. Le compte de fidélité existant est réutilisé ; aucun modèle parallèle.
5. Un retour POS approuvé inverse proportionnellement les points via des écritures `REVERSAL` et un identifiant déterministe par retour/attribution. **Remboursement, comptabilisation et points sont atomiques**. Un retour partiel conserve l'usage relationnel `CONSUMED`. Quand toutes les quantités originales sont effectivement retournées, le reliquat de points éventuel est inversé et l'usage passe à `CANCELLED` ; la réversion complète d'une vente suit le même principe.
6. Si des points gagnés ont déjà été dépensés avant le retour, le solde de points peut devenir **négatif** : dette de points auditable, bloquant de nouvelles utilisations tant que le solde est insuffisant. Le serveur n'efface ni l'achat ni l'utilisation passée.

## Garanties et limites

- Aucune nouvelle table ni migration ; stockage de la référence de programme dans `EnterpriseRelationshipBenefit.settingsJson.retailLoyaltyProgramId`.
- Toutes les recherches et mutations utilisent `organizationId`. Aucune attribution à une personne simplement liée à **un autre** Business Party.
- Le circuit automatique Retail existant est conservé pour les programmes `autoEarn: true` non liés à un avantage. Les deux chemins ne doivent jamais attribuer des points pour **le même programme** et la même vente.
- Le rapprochement montant utilise **6 décimales**, identiques au moteur Retail POS canonique ; ne pas arrondir le panier entier à 2 décimales avant le contrôle serveur.
- Dans ce lot, les points relationnels naissent uniquement du ticket POS canonique, pas d'une simple demande, d'une prévisualisation, d'un panier abandonné ni d'une commande omnicanale réservée.
- Les retours omnicanaux #904 ne sont pas une source de fidélité POS : aucune réversion fictive de points n'est réalisée lors du remboursement d'une commande ne comportant pas de ticket POS.
- Un changement de statut du programme, du consentement, de l'entitlement ou de l'audience **avant** la vente l'empêche de créditer des points. Il ne réécrit pas les gains de ventes historiques déjà confirmées.

## QA et OWNER_E2E requis

Contrôles locaux : `npm run qa:hotfix-906`, `npm run qa:hotfix-786-relationship-benefits-enforcement`, `npm run qa:hotfix-886`, `npm run qa:hotfix-904`, `npm run type-check`, `npm run lint`, `npm run build`, `npm run qa:regression`.

Scénario navigateur/API nouveau dans `tests/e2e/issue-786-relationship-benefits-enforcement.spec.mjs` :

1. Créer un programme Retail actif USD sans `autoEarn` et un avantage `LOYALTY` réservé à la relation `CUSTOMER` consentie, taux **2 points par USD**, quota **1**, puis vendre deux unités avec un financement réel.
2. Confirmer **une seule entrée EARN et un seul usage CONSUMED**, pour exactement deux fois le total TTC réel du ticket (six décimales). Rejouer la création de vente : aucune double entrée.
3. Faire approuver un remboursement d'une unité par un autre utilisateur : points proportionnels inversés, quota encore consommé. Rejouer : rien de nouveau.
4. Faire approuver le remboursement du solde : totalité des points inversée, solde revenu à zéro, quota `CANCELLED`. Rejouer : aucun double mouvement.
5. Tester un programme `autoEarn: true`, devise différente, statut suspendu, relation révoquée, utilisateur d'un autre tenant, quota concurrent, programme supprimé entre prévisualisation et validation : tous refusent ou échouent sans écriture partielle.
6. Vérifier le cas de points déjà dépensés avant retour : le solde devient négatif de façon traçable et aucun rachat n'est possible avant compensation. Vérifier les permissions et le formulaire FR/EN/mobile.
7. Rejouer les anciens scénarios Retail remises/retours #888/#903/#904 et Gaming #884 : aucune régression.

L'E2E propriétaire doit être marqué **BON** pour le numéro réel de la PR, séparément du résultat de la CI. Le numéro #906 est **l'issue**, pas une validation E2E et pas le numéro de PR.

## Réversibilité

Un revert applicatif via PR dédiée peut désactiver ce nouvel adaptateur sans effacer les points déjà gagnés, consommés ou annulés. Aucun effacement automatique des données canonisées ; toute correction de solde passe par une écriture de contrepassation auditée. Les parents #886 et #785 restent ouverts jusqu'au CASHBACK/CREDIT, DELIVERY et à la certification complète des 22 types de relations.
