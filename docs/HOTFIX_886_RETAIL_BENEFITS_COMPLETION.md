# Hotfix #886 — Complétude des avantages Retail

Issue de livraison : #888 (incrément du parent #886 / #785 P0). Baseline : `main@f21a5f0be6791f73ab545d5c0d7ea23a0a047a03`.
Statut : **implémentation partielle, PR DRAFT, aucun merge ni activation automatique**.
Gouvernance : jalon GitHub actif **Delivery Governance v1**, issue #888 liée à la PR #887 ; les P0 parents #886/#785 demeurent OPEN.

## Premier incrément — retour intégral et quota relationnel

Le moteur Retail inverse déjà `AUTO_RETAIL` lors d'une annulation de vente, mais le remboursement partiel/total par le circuit canonique `EnterpriseRetailReturn` n'inversait pas le quota après un remboursement total.

- Le circuit `decideRetailReturn` verrouille maintenant la vente tenant-scopée pour sérialiser les décisions de retour concernant cette vente.
- Après enregistrement du remboursement complet ET comptabilisation dans la transaction existante, on cumule uniquement les quantités des retours `COMPLETED` pour chaque ligne originale.
- Retour partiel : aucun changement de l'usage `CONSUMED`, aucune libération prématurée d'un quota qui se rapporte à la vente originale.
- Toutes les lignes intégralement retournées : réemploi du service canonique `reverseRetailRelationshipBenefitEffectsTx` et transition conditionnelle `CONSUMED → CANCELLED`. Aucune seconde écriture de solde.
- Rejeu d'une approbation déjà complète : réponse idempotente, aucun deuxième effet de remise, de remboursement ou de quota.
- Une demande `PENDING_APPROVAL` ou `REJECTED` ne participe pas au calcul. Les opérations sont toutes sous `organizationId`.
- Pas de modification Prisma, d'extension de rôle, de nouveau champ UI, d'entitlement ou de secret.

## Matrice de couverture de #886

| Critère | État de ce premier incrément |
|---|---|
| Retail POS remise automatique et annulation sale | Contrat existant préservé ; régression #786 |
| Retours POS partiels : quota maintenu | Code + scénario E2E ajouté ; CI à certifier |
| Retours POS complets : quota libéré une fois | Code + scénario E2E ajouté ; CI à certifier |
| Montants et TVA dans ce circuit | Remontent exclusivement du `EnterpriseRetailReturn` confirmé et de la comptabilisation Retail canonique |
| Omnicanal : preview et commit avec remise identique au POS, sans dette de quota | **NON LIVRÉ :** `createRetailOmnichannelOrder` crée une `EnterpriseSalesOrder`, pas une `EnterpriseRetailSale` ; aucun adaptateur certifié attaché au cycle de commande |
| CASHBACK/CREDIT/LOYALTY via comptes canoniques | **NON LIVRÉ :** nécessitera définition de l'événement économique, de l'autorisation, du point de reversal et du mapping vers les ledgers Retail existants |
| DELIVERY, services non monétaires | **NON LIVRÉ :** pas de preuve structurée de fulfillment, demande ≠ consommation |
| Matrice complète 22 relations, concurrence, retrait d'audience, devise, omnicanal | **NON CERTIFIÉE :** QA #786 / #884 continuent de couvrir la base ; extension #886 obligatoire |

Ne pas décrire une remise omnicanale comme effectivement appliquée au checkout parce que le moteur de tarif commercial affiche une promotion. Aucune `EnterpriseRelationshipBenefitUsage` ne doit être marquée `CONSUMED` par anticipation de la création de commande, de la réservation ou du seul remboursement demandé.

## Contrôles attendus

- `pnpm prisma generate`, `pnpm type-check`, `pnpm qa:hotfix-886`, `pnpm qa:regression`, `pnpm lint`, `pnpm build`.
- `shop2-behavioral` : scénario navigateur/serveur ajouté au test #786, comportant deux retours de quantité 1 sur une vente de quantité 2 ; consommation maintenue au premier, annulée au second, pas de duplication après rejeu.
- Régression non négociable de la facturation Gaming #884 et des remises Retail #786.
- Contrôles en CI et E2E propriétaire distincts. Aucun résultat de test ou de build ne doit être marqué réussi sans preuve du SHA final.

## OWNER_E2E (requis avant merge de cet incrément)

1. En entreprise Retail autorisée, créer une remise automatique monétaire sur relation consentie CUSTOMER active, limitée à une utilisation, appliquer à une vente réelle de deux unités.
2. Vérifier le prix de vente, la remise, la TVA, la devise, la ligne d'usage `CONSUMED` et le blocage du quota.
3. Demander puis faire approuver par un autre utilisateur un retour d'une seule unité ; confirmer le remboursement et sa comptabilisation : le quota reste consommé.
4. Rembourser la deuxième unité par le même circuit ; après approbation et comptabilisation, le même usage devient `CANCELLED` et le quota redevient utilisable.
5. Répéter l'approbation avec la même demande et vérifier aucune écriture, mouvement de stock ni consommation en doublon.
6. Valider rejets et permissions (self-approval, mauvaise entreprise, remboursement non autorisé, tenant modifié) ; FR/EN et mobile/desktop si affichages concernés.
7. Vérifier que les remises Gaming restent inchangées et que l'omnicanal, le cashback, le crédit et la fidélité ne sont pas faussement présentés comme couverts.

**Rollback** : revert du patch applicatif par une nouvelle PR, sans supprimer ventes, retours, consommations ou écritures financières passées. Ne jamais réécrire une entrée `POSTED`.

## Décision de périmètre

**Cette PR ne peut fermer que #888 : ne pas fermer #886 ni #785** sur ce seul incrément. Les autres objectifs exigent des adaptateurs métier canoniques et des E2E complémentaires ; les effets financiers ne seront pas simulés dans une couche parallèle.
