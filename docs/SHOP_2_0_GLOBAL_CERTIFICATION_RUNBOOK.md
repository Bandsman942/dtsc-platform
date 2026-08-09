# Shop 2.0 — Runbook de certification globale

## 1. Principe

`COMMERCIAL_READY_GLOBAL` n’est pas un statut marketing manuel. Il ne peut être attribué qu’après convergence de preuves techniques, comportementales, opérationnelles, documentaires et de livraison sur **un même SHA**.

Jusqu’à cette étape, le manifest doit rester :

- `shop2ProgramStatus = ITERATION_4_IN_PROGRESS` ;
- `commercializationStatus = COMMERCIAL_READY`.

## 2. Préconditions architecture

Vérifier :

- aucune table Retail parallèle de balance de stock ;
- aucune table Retail parallèle de master commande ;
- ventes online et replay offline utilisent `executeCanonicalRetailSale()` ;
- réservations dans `EnterpriseInventoryReservation` ;
- commandes dans `EnterpriseSalesOrder` ;
- fulfillment dans `EnterpriseFulfillment` ;
- écritures dans Finance/Accounting commun ;
- données CRM dans `EnterpriseBusinessParty` ;
- country packs sans taux fiscal codé en dur ;
- onboarding sans création automatique de comptes/soldes/réglementation.

## 3. Clean install / migrations

Depuis une base vide :

1. appliquer toutes les migrations dans l’ordre ;
2. `prisma generate` ;
3. vérifier la parité des schémas split ;
4. lancer les seeds canoniques ;
5. vérifier les audits migration/Finance/Inventory.

Aucune migration déjà appliquée ne doit être modifiée. Les migrations Itération 4 sont additives.

## 4. Scénarios offline obligatoires

### Snapshot

- création snapshot pour organisation/site/dépôt autorisés ;
- refus cross-tenant ;
- expiration observable ;
- promotion active => offline bloqué ;
- condition prix dynamique => offline bloqué ;
- aucun client/secret provider dans payload ;
- chiffrement IndexedDB AES-GCM.

### Replay

- vente cash statique => `SYNCED` ;
- même UUID + même payload => idempotent ;
- même UUID + payload différent => refus ;
- snapshot absent/expiré => `CONFLICT` ;
- prix/taxe modifié => `CONFLICT` ;
- stock devenu insuffisant => `CONFLICT` ;
- Finance/période/caisse non prête => `CONFLICT` ;
- paiement non CASH => `REJECTED` ;
- aucune écriture stock/comptable avant replay réussi.

## 5. Multi-store obligatoire

- disponibilité agrégée par site/dépôt ;
- réservation sur commande commune ;
- concurrence sur dernier stock : une seule réservation peut gagner ;
- libération de réservation idempotente ;
- réservation expirée non déduite de la disponibilité ;
- refus d’un dépôt d’une autre organisation ;
- transferts stock continuent d’utiliser le service Inventory commun.

## 6. Omnicanal obligatoire

Tester au minimum :

- `CLICK_COLLECT` ;
- `PICKUP_OTHER_STORE` avec site différent ;
- `SHIP_FROM_STORE` ;
- `CUSTOMER_DELIVERY` ;
- client issu de `EnterpriseBusinessParty` ;
- repricing serveur à la soumission ;
- commande créée dans `EnterpriseSalesOrder` ;
- contexte Retail sans duplication des montants/lignes ;
- réservation Inventory de toutes les lignes suivies ;
- compensation si une réservation intermédiaire échoue ;
- idempotence d’une création répétée ;
- visibilité du dernier `EnterpriseFulfillment` dans le statut cross-channel.

## 7. Country packs

Pour chaque pays déclaré commercialement supporté :

- pack versionné ;
- devises supportées ;
- localisation FR/EN si applicable ;
- fiscalité reliée au référentiel Finance ;
- numérotation configurée ;
- support matrix publiée ;
- toute capacité réglementée `EVIDENCE_REQUIRED` possède preuves datées et validateur identifié avant passage `VALIDATED` ;
- toute capacité non prouvée reste `NOT_CERTIFIED` ou `TENANT_CONFIGURATION_REQUIRED`.

L’absence de preuve interdit la revendication commerciale correspondante, mais n’empêche pas le socle Retail Core de fonctionner.

## 8. Onboarding

Vérifier les dix preuves : country pack, devise, site, dépôt, caisse, catalogue, Inventory links, équipe, comptabilité, configuration Retail.

Cas négatifs :

- compte d’une autre organisation refusé ;
- dépôt d’une autre organisation refusé ;
- devise différente de Finance => non ready ;
- article suivi sans Inventory link => non ready ;
- mapping comptable manquant => non ready.

L’onboarding ne doit jamais créer silencieusement une donnée canonique manquante.

## 9. UX / i18n / accessibilité

Sur FR et EN :

- mobile 390 px sans scroll horizontal structurel ;
- desktop ;
- navigation clavier des champs/actions ;
- labels/états compréhensibles ;
- loading/error/empty states ;
- aucune mention technique provider dans l’UI finale ;
- avertissements offline/certification visibles ;
- aucune action visible sans backend réel.

## 10. Gates obligatoires sur le SHA final

Doivent être verts sur le même SHA :

- Delivery Governance ;
- Quality Gates ;
- Shop 2 commercial UI ;
- Shop 2 behavioral gates ;
- Shop 2 global readiness ;
- clean-install migration ;
- Prisma generate ;
- typecheck ;
- lint ;
- build Production ;
- QA sector onboarding ;
- QA Retail/Shop 2 ;
- QA i18n/guides ;
- scénarios comportementaux Itération 4.

## 11. Promotion du statut

Seulement après les preuves ci-dessus :

1. mettre à jour le manifest de readiness avec le statut final supporté par le contrat QA ;
2. ajouter un gate qui refuse `COMMERCIAL_READY_GLOBAL` si les preuves/documentations Itération 4 manquent ;
3. exécuter les gates sur ce nouveau SHA ;
4. sortir la PR du mode draft ;
5. merger par le mécanisme autorisé dans `AGENTS.md` ;
6. ne jamais déployer Production depuis la branche feature.

## 12. Production

Après merge :

- relever le SHA exact de `main` ;
- vérifier que Vercel Production déploie ce SHA exact ;
- attendre `READY` ;
- vérifier GitHub Deployment `Production = success` ;
- vérifier le workflow Production release ;
- publier/contrôler le tag et la release du SHA exact ;
- exécuter le smoke test public/Account/App/Console/Support et le POS Shop ;
- seulement ensuite fermer #126 et cocher l’Itération 4 dans #122.

## 13. Rollback

En cas d’échec Production :

- rollback applicatif vers la release Production précédente ;
- ne pas réécrire/supprimer les migrations déjà appliquées ;
- conserver ventes/commandes/réservations/écritures historiques ;
- utiliser les opérations métier inverses prévues pour corriger un effet confirmé ;
- documenter l’incident avant une nouvelle tentative de release.
