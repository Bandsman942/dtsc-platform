# RETAIL-1042 — cahier des charges boutiques, paramétrage et Design 2.0

Statut du 6 novembre 2026 : **première tranche codée localement, aucune livraison ni acceptation client**.

## Cible produit

Une organisation DTSC Platform du secteur COMMERCE_RETAIL peut exploiter un nombre variable de boutiques (`EnterpriseSite`) avec leurs dépôts (`EnterpriseWarehouse`), sans fork sectoriel par client. Chaque option propre au métier vit dans `EnterpriseRetailConfiguration.settingsJson`, versionnée par `revision`. Aucun emplacement, propriétaire, nom ou nombre de boutiques n'est codé en dur.

## Tranche implémentée

- `inventoryPolicy`: `expiryMode = ALLOW | WARN | BLOCK`, `enforceFefo`, `warningDays` (1–365), `transferReception = IMMEDIATE | CONFIRMED`.
- Sans configuration nouvelle, comportement historique conservé (`ALLOW`, FEFO désactivé, réception immédiate) ; des paramètres incomplets hérités restent rétrocompatibles.
- Paramétrage : GET/PUT `/api/enterprise/:organizationId/retail/inventory-policy`, contrôle module/permission, same-origin, validation stricte, limitation de débit, CAS revision, audit.
- Vente Retail : contrôle serveur sur le lot disponible, dates expirées en date métier, et choix FEFO. Les autres règles existantes d'intégrité des ventes et de prix restent dans le moteur canonique.
- Surveillance : GET `/api/enterprise/:organizationId/retail/inventory-alerts?page=&pageSize=&warehouseId=` paginé, sans écriture, et panneau Design 2.0 FR/EN ; le mode WARN informe et ne bloque pas une vente.
- Sélecteurs de lots disponibles dans le POS (`retail/stock-lots`) et le formulaire de transfert ERP (`stock-transfers/lots`) avec quantité et péremption.
- Transferts communs : pour une entreprise Retail qui choisit `CONFIRMED`, l'approbation inscrit `TRANSFER_OUT` et met le transfert `IN_TRANSIT`, puis la réception autorisée, indépendante et révisée inscrit `TRANSFER_IN` et le termine ; pas de double comptage intermagasins. Le mode historique `IMMEDIATE` reste atomique.
- Conservation des lots en destination : nouvelle unicité `(organizationId, inventoryItemId, warehouseId, lotNumber)` ; clonage de l'identité de lot à réception, conservation dates/provenance. Pas de purge des anciens lots.
- Dimension de dépense `siteId` nullable, relation tenant-aware, validation du site actif et filtrage par boutique. Vue opérationnelle propriétaire `retail/site-overview` : ventes, encaissements POS, dépenses approuvées attribuées, sessions et stocks, par site/période/devise. Jamais de marge calculée à partir de prix indicatifs.
- Barrière de cohérence de caisse POS : les comptes financiers affectés à un site ne peuvent être utilisés pour une vente dans une autre boutique ; le POS filtre ces comptes et le backend refuse toute tentative directe hors site. Les comptes transverses sans `siteId` restent compatibles.
- Impression du justificatif POS au format A4 ou ticket thermique à partir de la route d'impression sécurisée, avec identification de la boutique d'émission.
- **Tranche 2 (en développement, non activée)** : modèle `EnterpriseRetailSiteAssignment` avec clé unique `(organizationId, siteId, userId)` et foreign keys tenant-aware ; rôles `MANAGER`, `INVOICER`, `CASHIER`, permissions explicites surchargées, archivage logique `isActive` et révision. Gestion GET/PUT propriétaire `/api/enterprise/:organizationId/retail/site-assignments` (Zod, same-origin, rate limit, audit) et panneau d'affectation Design 2.0 FR/EN. Le propriétaire voit les membres actifs, aucun annuaire global n'est exposé.
- Le résolveur `requireRetailSiteCapability` refuse un rôle absent, inactif ou sans permission et conserve les organisations existantes par défaut. **Ne pas mettre `siteStaffIsolationEnabled` à `true` avant le durcissement de toutes les routes métier**, faute de quoi des API historiques pourraient rester hors périmètre. Aucun bouton d'activation n'est exposé.

## Risques / rollback

La migration remplace un index unique transversal à l'organisation par un index unique incluant le dépôt ; les identifiants de lot existants, références de mouvements et balances restent intacts. Une restauration de schéma seule peut échouer si des lots avec le même numéro ont été créés dans plusieurs dépôts : sauvegarder et prévoir une restauration testée avant toute application de migration. Ne jamais inverser cet index en Production sans réconciliation des lots.

Le mode `CONFIRMED` peut laisser des marchandises en transit si personne n'enregistre la réception : surveiller les transferts `IN_TRANSIT` ; ne pas basculer le paramètre après expédition pour forcer leur clôture. Chaque transfert en transit possède sa propre route de réception indépendante de la politique courante.

## Exigences encore ouvertes (bloquantes pour le client)

1. Isolation complète des utilisateurs par boutique, périmètres et rôles administrateur/gérant/facturier/caissier, vérifiés sur toutes les routes ERP communes concernées. Le registre d'affectation est commencé, pas encore appliqué transversalement.
2. Préparation de facture impayée par facturier, transmission et encaissement par caissier, annulation, avoirs et paiements partiels traçables dans la comptabilité commune sans double écriture ni sortie de stock anticipée.
3. Lots reçus et sortis hors transfert : UI de réception par lot, historique et conformité approvisionnement, motifs de pertes.
4. Caisses propres au site, clôture et validation avec modes de paiement, sessions multiples contrôlées ; attribution de dépense existante à compléter par l'isolement d'accès par site.
5. Tableau de bord financier complet par boutique et consolidé (la vue opérationnelle est amorcée), vrai CA ≠ encaissements, coût des ventes/charges, exports PDF/Excel et impressions A4/thermiques.
6. Administration de N boutiques, affectation du personnel, support initial/formation, guide opérateur, plan de sauvegarde et exercice de restauration.
7. QA de bout en bout multi-rôles et multi-boutiques, mobile 320–1024 px, FR/EN, thèmes, faible réseau et concurrence. `OWNER_E2E` global obligatoire avant fusion.

## QA disponible

`node scripts/qa-hotfix-1042-retail-batches-transfer.mjs`, `node scripts/qa-hotfix-1042-site-staff.mjs`, `node scripts/qa-enterprise-inventory-checks.mjs`, `node scripts/qa-retail-product-coherence.mjs`, `prisma validate`, `tsc --noEmit`, `git diff --check`.

**Ne pas annoncer la conformité complète au client tant que ces sept exigences ne sont pas implémentées et validées.**
