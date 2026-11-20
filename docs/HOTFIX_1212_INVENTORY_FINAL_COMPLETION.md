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

## Lot 1C.1 — preuve du paiement d’origine (DRAFT)

Avant toute reconnaissance de créance, le diagnostic rapproche les allocations de dette avec leurs allocations de paiement et les paiements fournisseur OUTBOUND confirmés, les mouvements de trésorerie exacts et les journaux de paiement et d'allocation POSTED v1 non contrepassés. Périmètre initial : devise fonctionnelle, tiers explicite, paiement initial en avance à deux lignes puis imputation sur dette à deux lignes, taux 1, compte de trésorerie et mappings sémantiques concordants. Maximum 100 allocations, refus des sources ambiguës et écarts. Le diagnostic expose uniquement un état de preuve FR/EN; aucune référence bancaire, aucune nouvelle mutation ni écriture. Un résultat PROVEN ne constitue pas encore une créance reconnue et ne débloque pas l'expédition. Une preuve absente ou hors périmètre est signalée UNPROVEN, jamais convertie en zéro.

Le registre de créances et son posting ne sont pas encore raccordés : ils devront consommer cette preuve en transaction, y compris la protection contre les doubles imputations et le règlement futur. Aucune table inutilisée ajoutée dans cette tranche. Tests isolés de preuve positive, absence de trésorerie/journal, contrepassation, mauvais compte, FX, doublon, tiers différent et montant excessif ajoutés. CI/E2E à renouveler.

## Lot 1C–1D — registre et reconnaissance de créance (DRAFT, non fusionnable)

Une migration additive ajoute la ventilation financière immuable au dossier de retour existant (montant imputable, montant de créance et FK tenant-aware vers le compte d'actif). Pas de table concurrente, aucun backfill ; une créance n'est reconnue qu'au statut RECONCILED avec avoir et journal POSTED. Le compte sémantique optionnel SUPPLIER_RETURN_CLAIMS doit être explicitement provisionné, distinct de toute autre règle active ou compte financier. La baseline publiée OHADA 0.1.0 n'est pas modifiée; le provisioning versionné du mapping dans les organisations clientes reste bloquant avant livraison.

Le paiement d'origine prouvé, la ventilation figée et le compte sont contrôlés dès la demande, à l'approbation, sous verrou facture à l'expédition, à la création et au posting de l'avoir. Une demande dette seule ne devient pas une créance silencieusement après paiement. Le posting canonique débite la dette pour la part applicable et l'actif dédié pour la part excédentaire, crédite GRNI et la TVA historique le cas échéant. La dette reste non négative, le montant payé demeure historique, les champs d'allocation de dette ne contiennent que la part imputée. Le document d'avoir conserve le TTC total. Aucun encaissement ni frais de vente. La contrepassation isolée des journaux de paiement et d'allocation supports est refusée après expédition. L'ancien flux combiné d'approbation/posting ne peut pas approuver une créance. Le préflight et la fiche Achat/Validations affichent la ventilation FR/EN.

Restrictions : même devise fonctionnelle, preuves ordinaires déjà acceptées, un seul retour avec créance par facture (les précédents retours dette-only restent éligibles), aucun remboursement ni compensation active. Les anciens cas restent conservés. La résolution du compte, le remboursement/compensation, les rapports et les parcours multi-origines exigent encore leur certification et ne sont pas annoncés prêts. La PR reste en brouillon.

Recette HTTP/PostgreSQL ajoutée sur les factures de 70 payées 70 ou 65, retours de 14 (créance 14 ou 9, dette imputée 0 ou 5), refus avant mapping, écriture dédiée, absence de trésorerie supplémentaire, rejeu et protection des contrepassations. Configuration directe du mapping dans la fixture isolée uniquement; aucune certification encore exécutée. Finance affiche la créance distincte et réserve uniquement la part de dette; exports enrichis.

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
