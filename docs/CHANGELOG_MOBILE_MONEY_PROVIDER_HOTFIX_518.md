# Hotfix #518 — Provisioning opérateurs Mobile Money et wallets CDF/USD

Date : 2026-08-28

## Incident

Une entreprise `COMMERCE_RETAIL` de sous-type `SHOP` pouvait avoir le module `MOBILE_MONEY_AGENCY` actif et visible alors que son profil technique restait `RETAIL_CORE`.

Le provisioning historique activait les providers opérateur uniquement lorsque `EnterpriseRetailConfiguration.profileCode` valait `RETAIL_TELCO_MOBILE_MONEY`. Dans le nouveau contrat Retail, le sous-type métier et le profil technique sont volontairement séparés. Cette ancienne condition pouvait donc laisser le module Mobile Money actif sans aucun provider actif.

Effet utilisateur :

- la page **Comptes Mobile Money par devise** affichait la readiness `CDF + USD` ;
- l’API de configuration retournait une liste de providers vide ;
- aucune carte M-Pesa, Orange Money, Airtel Money ou Afrimoney n’était affichée ;
- les comptes financiers `MOBILE_MONEY` déjà créés ne pouvaient plus être liés aux wallets opérateur ;
- le parcours dépôt/retrait était bloqué.

## Correction

Le catalogue opérateur est désormais synchronisé avec les modules réellement actifs :

- `MOBILE_MONEY_AGENCY` actif → M-Pesa, Orange Money, Airtel Money et Afrimoney sont créés ou réactivés comme providers `MOBILE_MONEY` ;
- `TELCO_TOPUPS` actif → Vodacom, Orange, Airtel et Africell sont créés ou réactivés comme providers `TELCO` ;
- le profil historique `RETAIL_TELCO_MOBILE_MONEY` conserve son comportement rétrocompatible et maintient les deux familles actives ;
- l’activation, la désactivation et la réconciliation abonnement/modules synchronisent providers et modules dans la même transaction `Serializable`.

Le hotfix ne transforme pas le profil technique en nouvelle source de vérité métier. Il sert uniquement de compatibilité pour les tenants historiques.

## Données et migration

Migration :

`prisma/migrations/20260828194500_repair_retail_operator_provider_activation/migration.sql`

La migration est un backfill DML additif et idempotent :

- elle cible uniquement les organisations clientes `COMMERCE_RETAIL` non supprimées ;
- elle répare les providers lorsque le module opérateur correspondant est déjà actif ;
- elle utilise l’unicité `(organizationId, providerCode)` ;
- elle ne supprime aucune donnée.

Elle ne crée jamais :

- de compte financier ;
- de mapping `EnterpriseRetailProviderAccount` ;
- de solde ;
- de taux de change ;
- de transaction Mobile Money/Telco.

Les comptes financiers et leurs soldes restent la responsabilité du domaine Finance. Le mapping wallet reste explicitement choisi par un utilisateur autorisé dans la configuration Mobile Money.

## Contrat UI restauré

Le workspace existant `MOBILE_MONEY_AGENCY` reste la surface de configuration canonique. Une fois les providers restaurés, il affiche pour chaque opérateur les devises attendues et utilise les comptes financiers réels de la même organisation et de la même devise.

En RDC :

- `CDF` et `USD` restent les devises requises ;
- chaque ligne propose uniquement des `EnterpriseFinancialAccount` actifs de type `MOBILE_MONEY` et de la devise correspondante ;
- le serveur revalide encore le provider, le compte, le type, le statut, la devise et `organizationId` lors de l’enregistrement.

Aucun wallet ou solde n’est fabriqué pour donner l’impression que le module est configuré.

## Sécurité et isolation

Le hotfix ne modifie pas les barrières d’accès :

- les routes Mobile Money utilisent toujours `authorizeRetailRequest` ;
- les références financières restent rechargées avec le même `organizationId` ;
- une référence cross-tenant reste refusée ;
- un rôle global DTSC n’obtient aucun accès implicite aux données privées du tenant.

## QA

Le gate `scripts/qa-518-mobile-money-provider-provisioning.mjs` vérifie notamment :

- la synchronisation provider ↔ module ;
- la compatibilité du profil historique ;
- la synchronisation lors des trois chemins activation / désactivation / réconciliation ;
- le backfill additif ;
- l’absence de création de comptes, mappings ou soldes ;
- le maintien des contrôles serveur de l’API de mapping ;
- la présence du rendu UI `configuration.providers` → `WalletMappingRow` et du filtrage des comptes par devise.

Le gate est injecté dans `scripts/run-regression-qa-ci.mjs` afin de devenir une régression permanente.

## Validation propriétaire requise

Avant merge, l’acceptance propriétaire doit vérifier sur mobile et desktop :

1. ouvrir **Agence Mobile Money → Configuration** ;
2. confirmer la présence des quatre opérateurs Mobile Money ;
3. confirmer les lignes CDF et USD en RDC ;
4. lier chaque devise au compte financier `MOBILE_MONEY` correspondant déjà créé ;
5. recharger et confirmer la persistance du mapping ;
6. ouvrir une caisse dans la devise voulue ;
7. confirmer qu’un dépôt/retrait propose l’opérateur configuré pour cette devise.

## Rollback

Le rollback applicatif est un revert de la PR. La migration n’efface rien et peut rester appliquée : les providers réactivés n’accordent aucun accès si le module est désactivé et les contrôles serveur continuent de s’appliquer.

## Dette de contribution

- Dette créée : Aucune.
- Dette maintenue : compatibilité du profil technique `RETAIL_TELCO_MOBILE_MONEY`, déjà existante et explicitement documentée.
- Dette remboursée : module opérateur actif avec catalogue provider vide ; configuration wallets inutilisable malgré des comptes Finance existants.
- Dette reportée : Aucune.
