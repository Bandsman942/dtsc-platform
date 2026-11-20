# Suite #1212 — Inventory & Lot Traceability 2.0

DRAFT — base f44b40102b1a366be491f06ed8154bc283326a47 (#1214 fusionnée), cible 1.23.5. Refs #1212, ne pas fermer avant recette complète.

## Lot 1A — diagnostic de règlement

Sur la seule origine déjà admissible, calcul exact : dette imputable = min(avoir historique TTC, dette ouverte); créance potentielle = avoir - dette imputable; dette résiduelle = dette ouverte - dette imputable. Montants positifs/non négatifs à six décimales max, sans conversion FX. Vérifier la concordance payable/facture et devise dans le snapshot GET. Ces valeurs ne sont pas une preuve de dette envers nous, ni une allocation de paiement. La demande est masquée dans le formulaire lorsque le circuit de créance est nécessaire; les gardes d’expédition et d’avoir existantes restent fermées. L’approbation seule ne crée aucun mouvement.

### Recette à exécuter (non certifiée)

- [ ] Avoir 200 / dette 0 : créance potentielle 200, dette résiduelle 0.
- [ ] Avoir 200 / dette 50 : imputation 50, créance potentielle 150.
- [ ] Avoir 200 / dette 1000 : imputation 200, dette résiduelle 800.
- [ ] Montants invalides, précision >6, devise incohérente, facture/dette divergentes refusées.
- [ ] Lecture sans mutation, accès inter-tenant/site refusé, FR/EN, clair/sombre, mobile 320px.
- [ ] Période verrouillée, rejeu/concurrence, garde d’expédition inchangée.

## Lot 1B — concordance des allocations et garde serveur (DRAFT)

Le diagnostic et les transitions de demande, approbation et expédition partagent maintenant le lecteur canonique de ventilation. Il contrôle les identités du fournisseur/tiers, devise, montant initial, montants payés/crédités, solde, statut et agrégats d'allocations CONFIRMED non inversées. Une allocation inconnue, non positive ou marquée inversée tout en restant confirmée bloque. Le diagnostic reste en RepeatableRead et les mutations Serializable, avec verrou facture existant à l'expédition. Les nouvelles demandes non couvertes sont refusées 409, tout comme leur approbation si la dette a diminué; rejet/retrait et rejeu exact conservent leur logique. Aucun nouveau posting, droit, registre ou migration. Le lecteur ne prouve pas encore les journaux, paiements ou flux de trésorerie de chaque allocation.

QA isolée étendue : dette nulle/partielle, projection divergente, tenant étranger, allocation manquante et absence d'écriture après refus. Nouvelle certification CI et E2E restent obligatoires.

## Programme restant (aucune certification implicite)

1. Créance fournisseur canonique : preuve et registre, posting partie double, règlement par remboursement ou compensation approuvée, capacité et concurrence, avoir partiel/intégral sur facture payée.
2. FX et valorisation multi-origines : preuve du taux historique et coûts, allocations, transferts valorisés, fiscalité complexe.
3. Inverses métier liés et compensations, périodes closes.
4. Rapprochement historique et rapports, dry-run et décisions explicites; pas d'invention de preuve.
5. Pharmacy/Health/Manufacturing : adapters explicites, parcours spécialisés et QA, pas de double autorité.
6. Rappels : identification autorisée, notifications neutres, révision contrôlée, refus fournisseur.
7. Design 2.0 complet, exports et guides.
8. Certification réelle : type-check/lint/build, tests PostgreSQL, concurrence et rollback, QA régression, migration/Delivery, Playwright et revue, OWNER_E2E sur SHA final. Production depuis main uniquement, contrôle de déploiement et smoke tests avant clôture #1212.

Aucun backfill, aucune modification de données historiques, aucune migration dans le lot 1A. Ne pas fusionner cette tranche.
