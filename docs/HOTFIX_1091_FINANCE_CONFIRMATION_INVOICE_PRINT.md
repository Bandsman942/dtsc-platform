# Hotfix #1091 — Prévalidation de paiements et aperçu des factures multi-flux

**Date :** 09/11/2026 · **Version candidate :** v1.7.3 · **État :** à certifier (CI + OWNER_E2E) · **Issue :** #1091

## Constat prouvé en lecture seule

Le paiement Retail `PAY-MW9A1KC3-6E441F` (39 000 CDF) est `APPROVED`, avec caisse `OPEN`, compte financier actif et facture `INV-MW8K6RWY-4A4D29` émise et encore due à hauteur de 39 000 CDF. Les articles associés, « Coque téléphone universelle » et « Câble USB-C 1 m », disposent de quantités physiques, mais **d'aucune couche de coût restant disponible** dans `EnterpriseInventoryCostLayer`. Le code de confirmation et livraison atomique requiert une couche de coût justifiable.

Une lecture de l'état ne peut pas identifier avec certitude le premier refus HTTP de la tentative historique, car les anciennes routes n'auditaient pas tous les échecs métier ; l'absence de valorisation constitue toutefois un bloqueur reproductible. Il est interdit de fabriquer des coûts d'acquisition ou de doubler le stock pour supprimer l'erreur.

Le paiement `PAY-MW8ULQ8M-AB6926` (100 000 CDF, `RECONCILED`) possède une facture canonique Retail déjà liée et une allocation confirmée ; son aperçu doit rester disponible même après rapprochement.

## Contrat technique

### Paiements professionnels — `FINANCE_PAYMENTS`

- `GET /api/enterprise/:organizationId/payments` conserve un listing tenant-scoped, paginé et limité par les boutiques accessibles.
- Chaque ligne inclut `linkedSalesInvoiceId` **uniquement si** un lien structurel réel existe (proposition Retail ou allocation de créance confirmée). On ne crée jamais une facture fictive pour un paiement isolé.
- Un listing ne prétend plus être « confirmation disponible » sans avoir vérifié les prérequis réels. L'ouverture d'une fiche lance `GET .../payments?recordId=:id` ; le serveur effectue une **prévalidation sans effet de bord** et expose `confirmation.ready`, `blockerCode`, `blockerItems`.
- Les contrôles couvrent séparation des acteurs, compte et devise, caisse, site Retail, statut/montant facture, créance ouverte, coût des articles, quantité physique disponible, configuration comptable, mapping sémantique, journal et période.
- Ce précontrôle reste indicatif : **le POST de confirmation, sous transaction sérialisable, est le seul arbitre**. Les stocks, réservations, taux, périodes ou approbations peuvent changer entre la lecture et l'écriture. Aucun droit n'est inféré d'un bouton visible.
- Les erreurs HTTP 409 conservent leur **reasonCode métier** ; « opération modifiée » est réservé aux conflits de révision. Le POST refusé écrit `AuditLog` et `ApiLog` sans mot de passe, MFA ni données sensibles.
- Le lien « Aperçu imprimable de la facture » apparaît dans toutes les vues/statuts d'un **encaissement réellement lié à une facture** ; un encaissement autonome explique qu'aucune facture n'est disponible.

### Créances et factures clients — `FINANCE_RECEIVABLES`

- **Factures clients** : impression existante conservée, tous statuts (brouillon/provisoire, en attente, approuvée, émise, partiellement payée, payée, annulée).
- **Créances** : la ligne porte `salesInvoiceId`, le détail et la liste ouvrent le modèle canonique.
- **Échéances** : graphiques de vieillissement conservés et cliquables, auxquels s'ajoutent liste détaillée et pagination, avec impression.
- **En retard** : l'API continue de filtrer les échéances ouvertes dépassées et offre impression depuis liste et détail.
- La route d'impression existante conserve marque d'eau « non émis » / « annulé », logo, lignes, devise, solde réel, A4, styles premium, FR/EN et réponse `private, no-store`.
- Un titulaire de `FINANCE_PAYMENTS.view` qui n'a pas `FINANCE_RECEIVABLES.view` peut prévisualiser **uniquement** une facture rattachée à son paiement et sa boutique autorisée, avec preuve du lien vérifiée côté serveur. Les responsables RETAIL conservent leurs contrôles de boutique.

### Remédiation aux stocks historiques

1. Vérifier les réceptions/entrées d'inventaire historiques et factures d'achat correspondantes ; identifier les quantités et coûts réels en devise.
2. Rapprocher les quantités présentes dans `EnterpriseInventoryBalance` et les couches de coût réellement disponibles.
3. Corriger les mouvements/valorisations par les **procédures canoniques autorisées**, avec preuve d'achat, historisation et contrôle comptable. Ne jamais insérer une couche de coût arbitraire, créer une deuxième réception, ou modifier une écriture `POSTED`.
4. Quand les deux articles ont une valorisation conforme, rouvrir la fiche du paiement et revérifier son statut avant la confirmation par un **troisième acteur** autorisé.
5. Confirmer une seule fois et contrôler l'unicité de la sortie stock, du mouvement de caisse, du mouvement de trésorerie, des allocations et des écritures de partie double.

## Matrice de recette OWNER_E2E (non exécutée)

| Cas | Précondition | Résultat attendu |
| --- | --- | --- |
| C01 | Paiement Retail approuvé, coût absent | Bandeau rouge « valorisation manquante » + noms des articles, aucun bouton Confirmer |
| C02 | Coûts enregistrés et stock suffisant | Prévalidation verte si tous les autres prérequis passent |
| C03 | Caisse fermée / devise ou boutique différente | Message métier contextualisé, aucune mutation |
| C04 | Facture déjà soldée par un autre paiement | Confirmation refusée sans duplication |
| C05 | Deux personnes distinctes initient/approuvent ; troisième confirme | Auth renforcée, droits vérifiés, transaction atomique |
| C06 | Erreur de valorisation en confirmation | Toast précis, audit du reasonCode, état APPROVED maintenu |
| C07 | Paiement PAY-MW8ULQ8M-AB6926 rapproché | Aperçu de sa facture accessible en lecture seule |
| C08 | Flux Paiements professionnels : Brouillon, En validation, Approuvé, Confirmé, Rapproché, Contrepassé | Facture liée imprimable à chaque étape ; aucun document fictif pour paiement sans facture |
| C09 | Créances / Échéances / En retard | Recherche, filtre de vieillissement, pagination, détail et impression A4 |
| C10 | Facture brouillon ou annulée | Marquage visible sur le document, aucune facture définitive mensongère |
| C11 | Collaborateur autre boutique / autre organisation | 403 ou 404 sur facture et lien non divulgué |
| C12 | FR/EN, mode sombre, viewport 320 px | Boutons accessibles, navigation sans débordement |
| C13 | Livraisons/stock et journaux après confirmation | Aucun double mouvement / double posting ; soldes concordants |

**Commandes attendues :** `pnpm prisma:generate`, `pnpm type-check`, `pnpm lint`, `pnpm qa:hotfix-1091`, `pnpm qa:regression`, `pnpm build`, `git diff --check`, Quality/Delivery/Migration Gates. `OWNER_E2E` reste **NON_EXÉCUTÉ** jusqu'à validation explicite du propriétaire.

**Déploiement :** branche dédiée → PR → CI verte → revue → E2E propriétaire BON → merge main → déploiement Vercel Production via pipeline. Aucun déploiement manuel de branche.
