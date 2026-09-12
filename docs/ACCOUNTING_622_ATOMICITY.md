# Accounting C2 — Atomicité stock, dépenses et immobilisations

## Objet

L’itération #622 poursuit #602 en réutilisant `postBusinessEventTx()` pour les domaines où un fait de valorisation ou une transition comptable était encore validé avant/après le posting dans une transaction séparée.

## Contrat transactionnel

Pour les nouveaux traitements couverts :

```text
lock source tenant-scoped
→ calcul / changement métier comptable
→ postBusinessEventTx(...)
→ lien journal + statut POSTED
→ COMMIT unique
```

Si le posting échoue, la transaction entière rollback. Aucun event de valorisation nouveau, aucune couche de coût nouvelle/réduite, aucune classification de dépense nouvelle, aucun profil d’immobilisation nouveau et aucune entrée d’amortissement nouvelle ne restent durablement validés.

## Reprise historique

Le cutover ne rejoue pas les effets déjà commis par l’ancien modèle deux-phases :

- un `EnterpriseInventoryAccountingEvent` existant est repris et posté sans recréer/réduire les couches de coût ;
- un profil d’immobilisation existant est posté idempotemment sans recréer son échéancier ;
- un schedule d’amortissement `APPROVED` reste accepté afin de terminer son posting ;
- `postBusinessEventTx()` conserve advisory lock et clé source/version ; une écriture déjà POSTED est réutilisée.

## Flux couverts

- valorisation des réceptions stock ;
- valorisation des sorties stock ;
- valorisation des retours Retail en stock ;
- création/capitalisation d’un profil d’immobilisation ;
- posting d’un amortissement ;
- classification + comptabilisation d’une dépense approuvée.

## Hors scope explicite

- création POS/vente/retour métier complète et ses mouvements de stock : sous-lot suivant de #599/#521 ;
- posting de la paie déjà approuvée ;
- écritures récurrentes, accruals/deferrals et allocations périodiques ;
- réévaluation FX de clôture et year-end ;
- posting final de cession d’actif ;
- multi-ledger/intercompany/consolidation #600.

## Sécurité et intégrité

- isolation `organizationId` conservée ;
- aucune transaction imbriquée ;
- `posting-service.ts` reste l’autorité unique ;
- écritures POSTED immuables ;
- périodes, journaux, mappings, FX et readiness revalidés par le moteur ;
- aucune migration Prisma.

## QA

`scripts/qa-accounting-622-atomicity.mjs`, importé par `qa:enterprise-accounting` et donc par `qa:regression`, interdit le retour du posting hors transaction dans les fonctions couvertes et vérifie les contrats de reprise.

## OWNER_E2E

Valider au minimum : réception valorisée, sortie valorisée, vente/retour avec valorisation stock, création d’une immobilisation, amortissement, dépense approuvée/classifiée, puis retry d’une opération déjà comptabilisée sans doublon.

`OWNER_E2E` reste `NOT_EXECUTED` jusqu’à confirmation explicite.

## Rollback

Revert applicatif. Les écritures POSTED existantes, couches historiques et profils existants ne sont jamais supprimés ni réécrits.
