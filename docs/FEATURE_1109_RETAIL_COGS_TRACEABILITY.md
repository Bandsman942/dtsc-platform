# RETAIL — Traçabilité et rapprochement du coût des ventes (#1109)

**Candidat v1.11.0 · 11 novembre 2026 · OWNER E2E en attente · non fusionné / non déployé.**

## Source de vérité et interprétation

Le montant « Coût des ventes comptabilisé » continue de provenir **uniquement** des lignes `EnterpriseJournalLine` appartenant à un compte `COST_OF_SALES` via `accountSubtype` ou `EnterpriseAccountMapping`, dont l'écriture `EnterpriseJournalEntry` est `POSTED`/`REVERSED`. Le signe est débit − crédit. `functionalCurrencyCode` de l'écriture fait foi et chaque devise demeure séparée. Les contrepassations restent signées, les anciennes écritures sans boutique restent visibles dans le consolidé et sont exclues d'une boutique filtrée.

**Aucun coût indicatif du catalogue ni somme des événements de stock n'est ajouté à ce KPI.** Un événement de valorisation `EnterpriseInventoryAccountingEvent(ISSUE,POSTED)` lié au même journal, puis un `EnterpriseStockMovement` sortant, fournit une preuve de provenance ; plusieurs événements, une référence incohérente ou un mouvement absent classent l'écriture « à rapprocher ». Aucune association ne donne « coût certifié » automatiquement. Les écritures sans événement de stock apparaissent explicitement « sans lien de stock ». Cette classification par origine explique les montants comptabilisés ; elle ne constitue pas un bilan de stock valorisé ni une certification de la marge.

| Indicateur | Définition | Règle d'interprétation |
| --- | --- | --- |
| Coût comptabilisé | Somme signée de toutes les lignes COGS postées du périmètre | Autorité : grand livre, par devise fonctionnelle |
| Relié au stock | Sous-total des lignes COGS avec événement `ISSUE` posté unique et sortie cohérente | Traçabilité d'origine, pas validation financière indépendante |
| Sans lien de stock | Sous-total des lignes COGS sans événement de sortie reconnu | Revue des écritures manuelles/historiques nécessaire |
| À rapprocher | Sous-total des lignes présentant une preuve multiple, plusieurs lignes de coût pour un journal ou une référence incohérente | Revue humaine avant certification |
| Écart GL–valorisation comparable | Somme GL − somme des coûts d'événement `ISSUE` en 1:1, même devise, hors contrepassations | Écart vérifiable sur **ce sous-ensemble uniquement** ; les autres lignes sont signalées et exclues, sans conversion FX supposée |
| Couverture de valorisation | Sorties `SALE_FULFILLMENT` Retail invoice/ticket ayant un événement de valorisation posté / toutes ces sorties de la période | Mesure d'exhaustivité **des mouvements** de stock, pas part du CA ou du coût. Sans dénominateur : non applicable ; date de mouvement ≠ date comptable nécessairement. |

Contrôle arithmétique : `COGS grand livre = relié au stock + sans lien + à rapprocher` **dans la même boutique et la même devise** ; il s'agit d'une répartition exhaustive. Le rapprochement GL–valorisation est **indépendant mais partiel** : uniquement les couples 1:1 de même devise sans contrepassation. Les FX, les multi-lignes et les retours sont explicitement exclus et exigent une procédure de réconciliation historique avant certification.

## Quatre lots de livraison

1. **Source et traçabilité** : service SQL lecture seule, `organizationId` sur chaque table/association, montants `Prisma.Decimal` à six décimales, COGS issu de la même définition que le dashboard existant ; origine article/mouvement/vente/facture si le droit Stock le permet.
2. **Design 2.0 interactif** : clic sur KPI consolidé ou coût des ventes boutique ; vue plein écran interne, retour discret, filtres période/site/devise/statut/recherche, tendance journalière, légende, cartes financières colorées, pagination serveur 25/50/100, desktop/mobile, FR/EN et thèmes clair/sombre.
3. **Rapprochement et Rapports** : trois sous-totaux signés, indicateur de couverture des sorties Retail, détails de journaux, exports CSV/Excel/PDF premium de la page courante avec avertissement explicite, totaux consolidés calculés sans troncature ; snapshot `retail-cogs/v1` dans `EnterpriseReport`/module Rapports, données serveur seulement et information sur la limite de 100 lignes détaillées archivée.
4. **RBAC, audit, QA** : accès propriétaire/admin RETAIL + droit `FINANCE_ACCOUNTING` indépendant ; données Stock uniquement avec droit `INVENTORY_LOGISTICS` ; création de rapport avec `REPORTS.submit` **et accès Stock** ; lecture, liste, export et actions des rapports de traçabilité exigent aussi Comptabilité + Stock, même origine et audit ; QA #1109 intégrée aux Quality Gates et régressions #1105.

### Limites publiées et dette contrôlée

- Les exports manuels représentent **les lignes de la page sélectionnée** et indiquent toujours le nombre de lignes total. Pour un audit intégral volumineux, utiliser la pagination ; la génération asynchrone de fichiers exhaustifs volumineux et signés est tracée dans l'issue de dette [#1110](https://github.com/Bandsman942/dtsc-platform/issues/1110), avant commercialisation comme « export intégral ».
- Une correspondance `journalEntryId` unique ne prouve pas que sa valorisation native est égale à son montant fonctionnel GL. Les FX, les multi-lignes et la contrepassation empêchent toute certification automatique sans réconciliation plus stricte.
- Aucun schéma Prisma, migration, variable secrète ni écriture de stock/comptabilité n'est ajouté ou modifié.

## Recette propriétaire E2E — nécessaire avant fusion

1. Administrateur de SHOP BCN MULTI TEST, deux boutiques (Gombe/Limete) : ouvrir POS → Pilotage des boutiques → **Coût des ventes comptabilisé** ; vérifier l'écran Design 2.0 et le bouton retour.
2. Sélectionner 7 jours, 1 jour, dates personnalisées, toutes boutiques, une seule boutique et CDF/USD : aucun montant croisé entre monnaies, aucune donnée de Gombe en scope Limete, aucune somme négative effacée.
3. Sur au moins une vente d'accessoire valorisée : relever la facture/vente, la sortie de stock, l'article, l'événement de valorisation et l'écriture COGS. Le dossier lié est vert ; le montant GL est correct ; le coût indicatif catalogue ne s'y substitue pas.
4. Vérifier une écriture COGS manuelle/historique : « Sans lien de stock » ; un cas multiple/incohérent s'affiche « À rapprocher » ; le rapprochement total = les trois groupes.
5. Émettre un avoir/contrepassation test : le débit/crédit et la marge suivent le signe comptable ; pas de double comptage de la sortie de stock ; contrôler la situation sans boutique.
6. Comparer couverture de valorisation avec les sorties de stock éligibles : `0/0` affiche « Non applicable », jamais 100 %. Note de période différente entre stock et GL.
7. Tester recherche journal/article, filtre de statut, graphique cliquable, pagination 25/50/100, table responsive 320/360/375/390/414/768/1024, FR/EN, clair/sombre.
8. Exporter Excel/CSV/PDF : en-tête SHOP BCN, références, devise, signes, légende et avertissement « page courante » ; les totaux correspondent au serveur.
9. Enregistrer dans Rapports et ouvrir le rapport : même rapprochement, source `retail-cogs/v1`, export disponible, horodatage/auteur et audit de génération.
10. Refaire avec un utilisateur sans droit Comptabilité puis sans droit Stock puis sans droit Rapports et une autre entreprise : refus approprié ou détail masqué ; pas de fuite inter-entreprises.

**Livraison :** attendre Quality Gates verts puis la confirmation explicite `E2E final #<PR> BON`, avant squash merge `main` et déploiement Vercel Production.
