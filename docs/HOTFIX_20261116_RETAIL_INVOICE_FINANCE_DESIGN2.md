# Hotfix — Facture RETAIL → Encaissements ciblés et Finance/Reports DTSC 2.0

**Date :** 16 novembre 2026  
**Issue :** #1208  
**Version candidate :** 1.23.2  
**Branche :** `fix/1208-retail-invoices-finance-design2`  
**Statut :** candidat en validation, sans fusion ni déploiement Production avant Quality Gates + OWNER_E2E BON.

## Périmètre et comportement POS

Dans le POS RETAIL, la section **Registre des factures** propose, sur chaque facture pertinente, le lien « Ouvrir les encaissements de cette facture ».

Le lien est présenté **uniquement** lorsque :
1. l'entreprise a activé le flux séparé facturation / encaissement (`checkoutReady`) ;
2. l'API canonique marque `canCollect=true` pour la boutique et l'utilisateur ;
3. la facture a le statut `ISSUED`, `PARTIALLY_PAID` ou `OVERDUE` ;
4. le solde restant à encaisser est positif.

Le lien porte les paramètres `section=collections`, `siteId`, `invoiceId` (avec encodage). Le serveur `RETAIL_POS` protège l'accès à `section=collections` par la capacité réelle `COLLECT_PAYMENT`, le membership tenant et l'affectation de boutique. La liste de caisse réutilise `GET /api/enterprise/:organizationId/retail/invoices?view=collections&invoiceId=:id`, avec filtres **entreprise + boutiques autorisées + statuts émis**. Le dialogue d'encaissement existant s'ouvre exclusivement sur la facture correspondante ; sa propre API revalide les droits et le solde.

**Séparation des tâches** : le registre n'encaisse pas directement. Un paiement suit toujours le workflow Finance partagé (préparation, soumission éventuelle, approbation indépendante ou exception explicitement autorisée, confirmation, affectation). Aucun événement financier ne découle du clic sur le lien.

**Cas particuliers** : une facture payée, annulée, en brouillon ou refusée ne reçoit pas ce lien. Une facture devenue payée entre le chargement du registre et l'ouverture ne peut pas être encaissée de nouveau. L'utilisateur sans accès de boutique ou `COLLECT_PAYMENT` obtient un refus côté serveur.

## Design 2.0 des modules

Tous les modules utilisent les primitives métier existantes et les services canoniques, sans second CRUD, table métier ou moteur comptable.

| Module | Améliorations intégrées et points de continuité |
|---|---|
| `FINANCE_CLOSE` Clôture financière | Rail de statuts tactile, formulaire guidé de préparation de checklist, filtre de dates, exports existants, raccourcis autorisés vers comptabilité, rapprochement, états et rapports ; validations/fermeture/réouverture conservées |
| `FINANCE_STATEMENTS` États financiers | Rail de statuts, formulaire guidé type/période/devise/publication, versions immuables, aperçu/impression existants, liens vers comptabilité, clôture, actifs, stock, rapports |
| `FINANCE_ASSETS` Comptabilité des immobilisations | Rail de statuts, formulaire de capitalisation avec labels explicites pour coût, valeur résiduelle, durée et mise en service, comptes liés, amortissement et cessions existants, navigation autorisée |
| `FINANCE_INVENTORY` Valorisation du stock | Aide métier et navigation vers stock physique et finance, valorisation **en direct** au coût moyen pondéré, registre de réceptions non valorisées conservé. Les données historiques non disponibles ne sont pas simulées. Publication éventuelle de snapshots par États financiers |
| `REPORTS` Rapports | Filtre par date de génération, rails de statuts, recherche et type, réinitialisation, pagination existante, catalogue, détails plein écran, exports CSV/XLSX/PDF et programmation conservés ; liens Finance selon droits |

### Correction backend Rapports

Le filtre `GET /api/enterprise/:organizationId/reports?from=YYYY-MM-DD&to=YYYY-MM-DD` interprète désormais **les dates civiles dans le fuseau horaire de l'entreprise**, valide leur forme et l'ordre, puis borne la fin **exclusivement au début du lendemain local**. L'ancienne condition `generatedAt <= minuit du jour to` pouvait exclure les rapports produits après minuit le jour de fin. Les droits `REPORTS`, le périmètre et la visibilité documentaire ne changent pas.

### Navigation transverse et autorisations

Le composant serveur `EnterpriseFinanceRelatedLinks` résout chaque destination avec `resolveEnterpriseModuleAccess(..., "read")` dans l'organisation de la session. Les liens vers modules non activés, non inclus dans le plan ou non autorisés n'apparaissent pas. L'ouverture reste vérifiée par le routeur du module de destination. FR/EN, navigation mobile horizontale et dark mode restent applicables.

## Invariants conservés

- Comptabilité en partie double, périodes closes/locked sans nouvelle écriture, contrepassation et idempotence.
- Paiement commun avec allocations ; ni solde client concurrent, ni mouvement de caisse dans le registre.
- Stock : quantités physiques dans le module Stock ; coûts et valorisation dans Finance, uniquement sur mouvements réels.
- États financiers et Rapports : projections des données autorisées, sans suppression ni écriture sectorielle doublonnée.
- Multi-tenant, RBAC, devises séparées, visibilité par boutique, validations mutantes contrôlées par les API.
- Aucun changement de schéma Prisma, aucune migration, aucune variable d'environnement nouvelle.

## Recette technique / manuelle obligatoire

`scripts/qa-hotfix-20261116-retail-finance-design2.mjs` est intégré à `scripts/run-regression-qa-ci.mjs` et contrôle statiquement la présence des garde-fous POS, des liens serveur, des filtres de dates et des composants métier. **Ce test de contrat n'est pas un E2E navigateur.**

Vérifications de CI exigées : `git diff --check`, `pnpm prisma generate`, `pnpm type-check`, `pnpm lint`, `pnpm qa:regression`, tests ciblés, `pnpm build`. Les résultats réels seront consultables dans la PR ; ne pas affirmer que ces commandes sont passées sans traces.

OWNER_E2E à réaliser sur une entreprise RETAIL test disposant de deux boutiques :

1. En tant que facturier **sans** droit d'encaisser, créer et faire émettre une facture ; vérifier l'absence du raccourci.
2. Donner au facturier l'accès `COLLECT_PAYMENT` sur sa boutique, rafraîchir : le raccourci apparaît uniquement pour les factures émises impayées.
3. Ouvrir la facture depuis le lien : vérifier boutique, numéro, devise et solde ; le dialogue de paiement de **cette** facture doit s'ouvrir sans recherche.
4. Tester versement partiel, approbation/confirmation, rapprochement et solde ; le lien subsiste si montant dû positif, disparaît lorsque la facture est soldée.
5. Tester brouillon, rejet, annulation, facture déjà payée et boutique inaccessible ; le lien est absent ou l'accès est refusé côté serveur. Modifier `invoiceId` et `siteId` dans l'URL pour vérifier le 403/404 sans fuite.
6. Comparer vue mobile/desktop, lecteur sans droit, filtre d'une date précise, sélection de boutique, historique et contrôles de caisse.
7. Dans chaque module Finance : tester filtres de statuts, recherche, dates, prérequis du formulaire, actions réellement autorisées, exports, liens conditionnels et responsive FR/EN.
8. Rapports : filtrer un jour local, créer des rapports le matin et le soir du jour de fin ; les deux doivent apparaître. Inverser les dates : réponse 400.
9. Immobilisations : capitalisation, amortissement et cession d'un actif test ; vérifier écritures postées, livre, état financier, pas de double capitalisation.
10. Valorisation : entrée réelle, coût justifié, écriture, variation de la valeur stock, absence d'ajout de quantité dans Finance, pas de valorisation historique fictive.

**La fusion vers `main` et le déploiement Production sont interdits avant checks verts et validation propriétaire explicite `E2E final #PR BON`.**
