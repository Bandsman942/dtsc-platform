# Hotfix #668 — Registry & Business Coherence

## Objectif

Ce hotfix aligne le registre ERP canonique, les dépendances d’activation, les entitlements et la maturité commerciale sur les parcours réellement supportés.

Il part du `main` contenant le hotfix #667 et ne modifie ni le schéma Prisma ni les données métier.

## Registre canonique

Le code `CONTRACTS` n’a plus deux définitions concurrentes. La définition active du domaine commercial reste l’unique définition canonique :

- route : `/enterprise-modules/CONTRACTS` ;
- workspace : `ENTERPRISE_CONTRACTS` ;
- plan minimum : `BUSINESS` ;
- dépendance bloquante : `CRM_CUSTOMERS`.

Le runtime échoue désormais explicitement si un futur assemblage de registres introduit :

- un code canonique dupliqué ;
- un alias auto-référent ;
- un alias qui entre en collision avec un code canonique ;
- un alias ambigu entre deux modules.

La QA du registre agrège tous les fichiers canoniques, au lieu de vérifier uniquement le registre historique principal.

## Dépendances et intégrations recommandées

Le contrat devient explicite :

- `dependencies` = prérequis **bloquants** pour activation et accès ;
- `recommendedIntegrations` = intégrations métier utiles mais **non bloquantes**.

Une intégration recommandée inactive :

- n’empêche pas d’ouvrir le module cible ;
- n’est pas activée automatiquement par la réconciliation d’abonnement ;
- ne donne aucun entitlement, aucune permission et aucun accès au module recommandé ;
- apparaît comme avertissement de configuration afin que l’administrateur puisse compléter son environnement s’il le souhaite.

Le résolveur d’accès continue d’autoriser uniquement le module cible selon tenant, activation, abonnement, entitlement et permission. Toute opération qui utilise réellement un autre module doit continuer à autoriser ce module séparément.

## Finance

Les relations Finance ont été alignées sur les parcours supportés :

- Ventes & créances exige Tiers & clients ; Devis & commandes, Contrats et Vue d’ensemble deviennent des intégrations recommandées. Une facture directe reste donc possible sans commande.
- Achats & dettes exige Fournisseurs & achats ; Vue d’ensemble Finance est recommandée.
- Paiements exige Trésorerie ; Créances et Dettes sont recommandées et restent contrôlées séparément lorsqu’une allocation les utilise.
- Trésorerie peut fonctionner sans Vue d’ensemble Finance, qui reste recommandée.
- Caisse exige Trésorerie ; Paiements est recommandé.
- Rapprochement exige Banque ; Paiements est recommandé.
- Comptabilité peut fonctionner sans Vue d’ensemble Finance, qui reste recommandée.
- Clôture exige Comptabilité ; Rapprochement est recommandé afin de ne pas rendre Banque obligatoire pour toute entreprise.

Les autres dépendances Finance restent inchangées.

## Administration et abonnement

L’API d’administration des accès modules expose séparément les prérequis bloquants et les intégrations recommandées.

L’activation d’un module continue à :

1. vérifier secteur, plan et abonnement ;
2. vérifier/activer uniquement les `dependencies` ;
3. retourner les `recommendedIntegrations` à titre informatif sans les activer.

La désactivation protège uniquement les dépendants qui ont réellement déclaré le module comme prérequis bloquant.

## Commercial readiness

La maturité commerciale expose désormais les intégrations recommandées du registre canonique.

Ce hotfix ne promeut aucun module automatiquement. Les statuts `COMMERCIAL_READY` existants restent fondés sur leurs preuves et validations propriétaires antérieures ; la QA continue d’interdire qu’un profil ou une valeur par défaut promeuve un module.

## IA

L’autorisation des outils IA continue à réutiliser `resolveEnterpriseModuleAccess()` et les contrôles de plan. Une intégration recommandée dans un autre module ne donne donc jamais accès à un outil IA du module recommandé si son entitlement, son activation ou ses permissions ne l’autorisent pas.

## Base de données

- migration Prisma : aucune ;
- backfill : aucun ;
- modification destructive : aucune ;
- compatibilité : additive au niveau du contrat de registre.

## Rollback

Revert applicatif de la PR. Aucune donnée ni migration n’est à restaurer.

## Validation

CI attendue :

- `pnpm qa:hotfix-668`
- `pnpm qa:enterprise-module-registry`
- `pnpm qa:regression`
- `pnpm prisma:generate`
- migrations depuis une base propre
- `pnpm type-check`
- `pnpm lint`
- `pnpm build`

OWNER_E2E : `docs/OWNER_E2E_668_REGISTRY_BUSINESS_COHERENCE.md`.
