# OWNER_E2E #908 — Cashback relationnel Retail sous forme d’avoir magasin

Statut : **préparé, non validé**. Le code de #908 ne doit pas être fusionné avant migration sur base isolée, CI verte et confirmation explicite `E2E #908 BON`.

## Prérequis

1. Déployer la branche sur un environnement de test isolé **avec sa migration additive** ; ne pas appliquer la migration à la production pour réaliser l’E2E.
2. Configurer Comptabilité : `SALES_REVENUE`, `TAX_PAYABLE` si TVA, `OPERATING_EXPENSE` et `CUSTOMER_ADVANCES`, ainsi que les comptes de caisse/bank habituels et une période comptable ouverte.
3. Activer `RETAIL_POS` et `RELATIONSHIP_BENEFITS` et créer une relation consentie, active et reliée au tiers client du POS.
4. Publier un avantage `CASHBACK`, devise correspondant au POS, valeur `PERCENT` (par exemple 5), cible `RETAIL_POS`, cumul activé et action `NONE`.
5. Ouvrir les sessions de caisse si un paiement en espèces doit être effectué.

## Scénarios à cocher

- [ ] Achat de 100,00 en espèces : cashback 5 % = **5,00 d’avoir**. La caisse augmente de 100,00 et **non** de 105,00 ; le compte client affiche 5,00 et un usage `AUTO_RETAIL_CASHBACK` daté.
- [ ] Rejouer exactement la vente avec la même clé : aucun doublon du ticket, du cashback, de la consommation d’avantage ni de l’écriture comptable.
- [ ] Client différent, relation non consentie, bénéfice suspendu, devise différente, module désactivé ou plafond de consommation atteint : aucun avoir ne doit être attribué.
- [ ] Achat suivant de 20,00 payé par **5,00 d’avoir + 15,00 d’espèces** : compte d’avoir à 0,00, caisse +15,00 ; aucun encaissement financier artificiel de 5,00. Vérifier le débit de `CUSTOMER_ADVANCES` dans le journal.
- [ ] Tenter 5,01 avec seulement 5,00 disponibles, utiliser l’avoir d’un autre client ou d’une autre devise, ou injecter simultanément `financialAccountId` et `storedValueAccountId` : erreur explicite et **aucun effet secondaire**.
- [ ] Refuser le retour : ni remboursement, ni réversion du cashback.
- [ ] Retour approuvé de 40 % du ticket initial : réversion proportionnelle de 2,00 sur cashback de 5,00 ; limite de relation toujours consommée, écriture comptable équilibrée.
- [ ] Retour des 60 % restants : réversion des 3,00 restants, usage annulé, quota libéré. Si l’avoir a déjà été dépensé, le solde peut devenir négatif (« dette d’avoir ») et bloquer toute nouvelle consommation jusqu’à reconstitution.
- [ ] Remboursement du ticket payé partiellement par avoir : la part d’origine payée par avoir doit **revenir sur le même compte**. La part espèces suit la caisse avec session ouverte.
- [ ] Annulation complète d’un ticket sans retour antérieur : remboursement du montant des tenders, réversion intégrale du cashback, pas de doublons en réessayant. Refuser l’annulation globale d’un ticket ayant des retours déjà confirmés.
- [ ] Tester deux caissiers concurrents sur le même solde d’avoir ; aucun solde positif ne peut être dépensé deux fois.
- [ ] Vérifier le rapport vente, le ticket, l’historique relationnel et les soldes sur écran étroit, en français et en anglais.
- [ ] Vérifier dans le Grand livre : vente initiale **Débit trésorerie 100 + Débit charge cashback 5 / Crédit vente 100 + Crédit dette d’avoir 5** ; vente avec avoir **Débit trésorerie 15 + Débit dette d’avoir 5 / Crédit vente 20** ; réversion des retours équilibrée.

## QA automatisée locale

`node scripts/qa-hotfix-908-retail-cashback.mjs`, `node scripts/qa-hotfix-906-relationship-loyalty.mjs`, `node scripts/qa-hotfix-886-retail-benefits.mjs`, Prisma generate/validate, lint, TypeScript, tests, build et CI distante.

Cette validation ne couvre **pas** l’avantage `CREDIT` à montant fixe ; ce mécanisme nécessite un déclencheur métier distinct, convenu dans le prochain hotfix.
