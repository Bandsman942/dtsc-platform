# DTSC RETAIL — Commerce sans caissier / CASH #1216

**Statut : candidat de branche — non fusionné, non déployé.** Baseline main `f44b401`.

## Contrat métier

Dans **Administration entreprise → Paramètres entreprise → Mode de fonctionnement RETAIL**, activer les trois cases : commerce sans caissier, impression rapide, navigation simplifiée. Personnaliser le ticket 80mm/A4 et les deux mentions de pied de facture. Les mentions doivent être validées au regard des droits impératifs des consommateurs.

Une dérogation par boutique peut remplacer la configuration d'entreprise. L'activation RETAIL préexistante `siteStaffIsolationEnabled` et `invoiceCheckoutEnabled` est requise. Le personnel affecté au magasin conserve ses permissions explicites. L'utilisateur `INVOICER` n'obtient pas `COLLECT_PAYMENT`, `ISSUE_INVOICE`, `OPEN_CASH` ou les deux `SELF_APPROVE_*` par simple activation du mode.

Dans la boutique affectée, l'administrateur doit déléguer précisément `PREPARE_INVOICE`, `ISSUE_INVOICE`, `COLLECT_PAYMENT`, `OPEN_CASH`, `SELF_APPROVE_INVOICE`, `SELF_APPROVE_PAYMENT` après vérification du risque. Les propriétaires administrent la politique mais les règles natives ne leur accordent pas de bypass d'auto-approbation en tant que préparateurs. Préparer une session CASH personnelle ouverte, un compte financier CASH actif et des prix/inventaires prêts.

Le serveur n'accepte que `CASH` sur la route directe de ce lot. Les moyens Mobile Money, banque, chèques, cartes, paiements mixtes ou partiels restent dans leurs workflows existants, sans promesse d'instantanéité.

## API

- `GET /api/enterprise/:org/retail/operating-settings?siteId=` : administrateur, réglages, héritage, boutique et révision.
- `PUT /api/enterprise/:org/retail/operating-settings` : administrateur + step-up MFA/mot de passe, validation Zod, révision, audit atomique. Body `{revision,siteId:null|string,settings}`.
- `GET /api/enterprise/:org/retail/direct-checkout/options?siteId=` : facturier habilité, permissions effectives, comptes CASH et sessions personnelles ouvertes du site.
- `POST /api/enterprise/:org/retail/direct-checkout` : session, same-origin, entitlement, Zod, rate-limit, calcul prix serveur, validations, transaction de facture, validations attribuées, émission, paiement et rapprochement durable. Body `{idempotencyKey,siteId,warehouseId,businessPartyId,currencyCode,expectedGrandTotal,lines,payment:{methodType:"CASH",financialAccountId,cashSessionId,cashTendered}}`. `cashTendered` est le billetage présenté, **pas** la valeur comptabilisée.
- En sortie `{status:"COMPLETED",invoiceId,invoiceNumber,paymentId,total,cashTendered,changeDue,currencyCode}`; sinon refus explicite et opération de récupération de la même clé.

## Source de vérité / transaction

`EnterpriseRetailDirectCheckoutAttempt` ne stocke **aucun** deuxième solde ou journal financier : uniquement clé et fingerprint, acteur, site, pièces Finance et état technique. `EnterpriseRetailInvoiceCheckout.invoiceFooterSnapshot` fige les mentions de facture à création.

Sous une même tentative, `prepareRetailInvoice` crée la facture Finance; les orchestrateurs communs gèrent l'approbation explicite; `transitionSalesInvoice(ISSUE)` poste la créance; `proposeRetailInvoicePayment` crée le paiement DRAFT Finance; les orchestrateurs communs soumettent/approuvent. La confirmation Finance exécute transactionnellement mouvement CASH, trésorerie, posting, allocation et, au solde nul, sortie/valorisation stock. Aucune comptabilisation ne se produit dans l'adapter direct.

La préparation et l'émission sont deux commits séparés de la confirmation. Une erreur après émission conserve la facture et reprend sur la même référence. L'indisponibilité d'un lot ou d'un coût au moment de confirmation refuse l'atomicité financière et laisse la facture à régulariser. L'expiration de lease ne prouve pas à elle seule un échec métier.

## Simulation CASH propriétaire

- Panier A 50 000 CDF, B 35 000 CDF; total 85 000 CDF.
- Espèces reçues 100 000 CDF; monnaie rendue 15 000 CDF.
- Transaction Finance : paiement 85 000 CDF; caisse +85 000 CDF; créance 0.
- Selon la fiscalité configurée : facture comptabilisée et ventilée; selon la politique coût : sortie stock et coût réel calculé, jamais inventé.
- Note : 15 000 CDF de monnaie rendue n'est ni dépense ni remboursement. Réimpression après succès.

## OWNER_E2E final : scénarios BLOQUANTS

1. Configurer deux boutiques A/B, financer chaque caisse et affecter deux opérateurs avec permissions explicites.
2. Vérifier réglages entreprise et override B, révision périmée 409 et identités non administratrices 403.
3. Préparer des stocks, lots, coûts et taxes de test avec comptes Finance; vérifier `inventoryPolicy`.
4. Réaliser la vente CASH 85k, billets 100k, monnaie rendue 15k sur une caisse propre OPEN.
5. Vérifier base : facture UNIQUE, émission Finance, paiement CONFIRMED unique, allocation unique, caisse +85k, trésorerie +85k, créance 0, sortie stock et coûts, écritures équilibrées.
6. Réimprimer A4 et 80 mm ; mentions configurées et instantané après changement de réglage.
7. Doubler le clic, rejouer la même clé après réponse perdue, modifier payload avec même clé (409), et tester deux requêtes concurrentes.
8. Révoquer l'une des 6 permissions, fermer caisse, utiliser compte/site B et vérifier refus même si UI n'est pas actualisée.
9. Introduire stock insuffisant, lot périmé, coût manquant et période verrouillée; vérifier aucune comptabilisation cash incomplète.
10. Interrompre après facture préparée, après émission et avant confirmation; reprendre sans nouvelle facture ou nouveaux paiements.
11. Vérifier mobile 320,360,375,390,414,768,1024; clavier, FR/EN, thème, focus et impression bloquée par popup.
12. Vérifier l'ancien mode avec caissier, les retours, factures non RETAIL, multi-boutiques, abonnements et résultats financiers; aucun double compte.

**Preuve :** rapport CI exact SHA, résultats API/Postgres et captures navigateur, difficultés et rollback documentés. **Aucun statut OWNER_E2E=BON avant confirmation explicite du propriétaire.**

## Politique de livraison / rollback

Branche `feat/1216-retail-direct-cash-checkout`, PR contre `main`, Quality Gates et OWNER_E2E avant fusion. Aucun Vercel Preview ni production depuis cette branche. Pour revenir au parcours précédent : désactiver la configuration directe (sans effacer les historiques), faire une PR de correctif traçable et traiter les tentatives déjà engagées via Finance canonique. Migration additive conservée.
