# Shop 2.0 — Matrice officielle de couverture pays

## Statut du document

Ce document est la matrice officielle des capacités Retail revendiquables par pays pour Shop 2.0.

Principe : une capacité n’est commercialement revendiquée que si son état ci-dessous et les preuves associées le permettent. Le statut technique `COMPLETE` du programme Shop 2.0 ne transforme jamais automatiquement une capacité pays en certification juridique, fiscale ou réglementaire.

## Légende

- `SUPPORTED` : capacité produit techniquement supportée par le socle et couverte par les contrats QA applicables.
- `TENANT_CONFIGURATION_REQUIRED` : capacité disponible uniquement après configuration explicite et valide du tenant.
- `EVIDENCE_REQUIRED` : capacité nécessitant une preuve juridictionnelle/opérationnelle datée et un validateur identifié avant toute revendication correspondante.
- `NOT_CERTIFIED` : aucune certification commerciale n’est revendiquée pour cette capacité.

## République démocratique du Congo — `CD_RETAIL_CORE_V1`

| Capacité | Statut | Portée commercialement revendiquable |
|---|---|---|
| Retail Core | `SUPPORTED` | POS, catalogue, stock, CRM, achats, Finance et clôture Retail selon modules/entitlements actifs. |
| Localisation | `SUPPORTED` | Interface et guides Retail FR/EN avec configuration tenant. |
| Multi-devise | `SUPPORTED` | CDF/USD avec devise fonctionnelle, devise transactionnelle et consolidation FX via Finance commun. |
| Référentiel fiscal | `TENANT_CONFIGURATION_REQUIRED` | Les taxes sont résolues depuis le référentiel Finance du tenant ; aucun taux fiscal n’est codé dans le country pack. |
| Numérotation documentaire | `TENANT_CONFIGURATION_REQUIRED` | Séquences et règles de numérotation restent configurables par organisation. |
| Ticket/reçu fiscal réglementé | `EVIDENCE_REQUIRED` | Ne pas revendiquer une conformité fiscale locale avant extension validée et preuves datées. |
| E-invoicing | `NOT_CERTIFIED` | Aucune certification e-invoicing n’est actuellement déclarée. |
| Mobile Money / Télécom | Extension optionnelle | Disponible via le profil `RETAIL_TELCO_MOBILE_MONEY` et ses intégrations réellement configurées ; aucun provider non configuré n’est présenté comme connecté. |
| Offline | `SUPPORTED` sous contraintes | Continuité cash-only contrôlée, snapshot borné/chiffré, replay serveur idempotent et conflits explicites. |
| Multi-store | `SUPPORTED` | Disponibilité et réservations via Inventory commun, sans balance Retail parallèle. |
| Omnicanal | `SUPPORTED` | Click & collect, retrait autre magasin, ship-from-store et livraison client via Sales/Fulfillment communs. |

## Pays actuellement publiés

À ce stade, seul le pack `CD_RETAIL_CORE_V1` est enregistré dans `RETAIL_COUNTRY_PACKS`.

Aucun autre pays ne doit être présenté comme officiellement supporté ou certifié par Shop 2.0 tant qu’un country pack versionné, ses capacités, ses tests et ses preuves n’ont pas été ajoutés au registre et à cette matrice.

## Règles de gouvernance

1. Le code `lib/enterprise/retail/country-packs.ts` est la source de vérité machine des country packs disponibles.
2. Cette matrice est la projection documentaire officielle destinée aux équipes Produit, Sales, Support et Direction.
3. Toute divergence entre le registre code et cette matrice bloque une nouvelle revendication commerciale pays.
4. Une capacité `EVIDENCE_REQUIRED` ne passe pas implicitement à `SUPPORTED` parce que le produit fonctionne techniquement.
5. Les taux fiscaux, obligations légales et certifications ne sont jamais inventés ou codés en dur dans Retail Core.
6. Une nouvelle couverture pays passe par branche, PR, Quality Gates, preuves pays, mise à jour de cette matrice et Production depuis `main`.

## État commercial global

- Programme technique Shop 2.0 : `COMPLETE`.
- Commercialisation Shop : `COMMERCIAL_READY`.
- Certification commerciale globale : non promue automatiquement.

La prochaine évolution éventuelle vers `COMMERCIAL_READY_GLOBAL` doit être une décision de gouvernance distincte et fondée sur la couverture pays réellement prouvée.
