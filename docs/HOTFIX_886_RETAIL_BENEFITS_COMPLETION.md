# Hotfix #886 — Complétude des avantages Retail

Issues de livraison : #888 (premier incrément du parent #886 / #785 P0), puis #903 pour l'incrément `fix/886-omnichannel-benefits-guard` (PR #902). Baseline du second incrément : `main@827854513cef490a7d361b539eeb665430ff5f77` (25/10/2026).
Statut actualisé au 25/10/2026 : **#888, #903 et #905 validés OWNER_E2E et fusionnés sur `main`**. Le hotfix de retours omnicanaux [#904](https://github.com/Bandsman942/dtsc-platform/issues/904) a été fusionné par la PR #905, `main@b105ab3b`. **Incrément suivant en développement : [#906](https://github.com/Bandsman942/dtsc-platform/issues/906), fidélité relationnelle canonique, non encore fusionné et non encore validé OWNER_E2E.** Les statuts historiques de cette page ci-dessous documentent les décisions successives, pas l'état de publication courant ; consulter `docs/HOTFIX_906_RELATIONSHIP_LOYALTY.md` pour son état exact.
Gouvernance : jalon GitHub actif **Delivery Governance v1** ; le correctif de la PR historique #887 a été repris commit par commit depuis le dernier `main` sans écraser les évolutions intermédiaires. Les P0 parents #886/#785 demeurent OPEN.

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

| Critère | État cumulé des incréments |
|---|---|
| Retail POS remise automatique et annulation sale | Contrat existant préservé ; régression #786 |
| Retours POS partiels : quota maintenu | **#888 fusionné, OWNER_E2E BON** |
| Retours POS complets : quota libéré une fois | **#888 fusionné, OWNER_E2E BON** |
| Montants et TVA dans ce circuit | Remontent exclusivement du `EnterpriseRetailReturn` confirmé et de la comptabilisation Retail canonique |
| Omnicanal : preview et commit avec remise identique au POS, sans dette de quota | **Deuxième incrément #903 en PR #902, non déployé :** même resolver Retail POS pour la prévisualisation et la commande ; quota `REQUESTED` atomique avec commande, `CONSUMED` après livraison complète, `CANCELLED` en cas d'annulation avant livraison ; E2E à certifier |
| Omnicanal : retours et remboursements d'une commande livrée | **EN COURS — #904** : parcours opérationnel, Finance canonique, stock et quota à valider ; voir `docs/HOTFIX_904_OMNICHANNEL_RETURNS.md` |
| CASHBACK/CREDIT/LOYALTY via comptes canoniques | **LOYALTY en développement dans #906, non fusionné** : points proportionnels au ticket POS et réversion canonique. CASHBACK/CREDIT via Stored Value restent non livrés. |
| DELIVERY, services non monétaires | **NON LIVRÉ :** pas de preuve structurée de fulfillment, demande ≠ consommation |
| Matrice complète 22 relations, concurrence, retrait d'audience, devise, omnicanal | **NON CERTIFIÉE :** QA #786 / #884 continuent de couvrir la base ; extension #886 obligatoire |

Ne pas décrire une remise omnicanale comme effectivement appliquée au checkout parce que le moteur de tarif commercial affiche une promotion. Aucune `EnterpriseRelationshipBenefitUsage` ne doit être marquée `CONSUMED` par anticipation de la création de commande, de la réservation ou du seul remboursement demandé.

## Deuxième incrément en attente de livraison — cycle de commande omnicanal

- Résolution des tarifs via les mêmes `resolveRetailCommercialPricingDecisions`, `resolveRetailRelationshipBenefitPricing` et `applyRetailRelationshipBenefitPricing` que les tickets POS. Les montants de `EnterpriseSalesOrder` sont arrondis à 2 décimales : un écart matériel est bloqué par `RETAIL_OMNICHANNEL_PRICE_PRECISION_UNSUPPORTED` pour ne pas masquer une différence de prix ou de taxe.
- La confirmation d'une nouvelle commande crée son usage `AUTO_RETAIL_OMNICHANNEL` en `REQUESTED` dans **la même transaction** que les lignes et montants de commande. La relation, son attribution, sa liaison au tiers, sa devise, son quota, son contexte et son module sont revalidés sous verrou de quota partagé avec le POS.
- La transaction de commande et contexte Retail est sérialisable (maximum 30 secondes) et les erreurs PostgreSQL de sérialisation sont rejouées par le retry Retail partagé (3 tentatives bornées). Une clé identique avec un panier différent est refusée.
- Une réservation de stock ratée après la commande déclenche une compensation avec annulation conditionnelle de l'ordre et du quota encore réservé. Une annulation explicite avant toute livraison libère les réservations de stock par le service Inventory canonique et annule le quota dans la même transaction.
- Le formulaire Retail omnicanal affiche un bouton d'annulation uniquement pour les commandes encore réservées et non livrées ; un motif obligatoire est saisi dans une zone de confirmation responsive FR/EN. L'historique des avantages affiche **Réservée** plutôt que « consommée » tant que l'ordre n'est pas livré.
- La livraison partielle conserve `REQUESTED`. Seule la livraison intégrale `PRODUCT_DELIVERY`, avec réservations déjà prêtes **et acceptation client ou document de preuve**, marque l'usage `CONSUMED` dans la transaction de fulfillment. Les retours après fulfillment **ne sont pas couverts** par cet incrément.
- Le fulfillment d'une commande identifiée comme Retail nécessite désormais le droit d'écriture **Sales et Retail POS** du même tenant. Le `proofDocumentId`, lorsqu'il remplace l'acceptation client, doit viser un document réel, versionné et lié à cette commande dans la même entreprise.
- Rejeu de création et d'annulation idempotents ; une clé de commande réutilisée avec un autre tiers, panier ou mode logistique renvoie un conflit explicite.
- Nouveau scénario E2E navigateur/API dans le test #786 : prix, quota réservé, refus de double bénéfice, annulation, libération du stock, nouvelle commande, livraisons partielle et intégrale. **Non encore certifié par la CI ni le propriétaire**.

Ne pas activer la branche avant la CI, l'E2E propriétaire et la revue des scénarios de concurrence. L'absence de pipeline de retour omnicanal signifie que #886 et #785 demeurent OPEN.

### OWNER_E2E supplémentaire — commande omnicanale

1. Créer une remise automatique `DISCOUNT` consentie et limitée à une utilisation pour un client Retail lié à une relation active, puis prévisualiser un panier de deux unités (prix TTC, taxes et devise).
2. Confirmer une commande omnicanale : constater le **même total arrondi au centime** et une entrée `AUTO_RETAIL_OMNICHANNEL` en `REQUESTED`, non en `CONSUMED` ; aucun deuxième droit disponible pendant la réservation.
3. Rejouer la commande avec la même clé : même order ID et une seule entrée d'usage. Réessayer avec la même clé mais un autre client ou panier : conflit explicite.
4. Annuler avant livraison : réservation de stock libérée et usage `CANCELLED` ; double annulation idempotente ; le quota redevient disponible. Un utilisateur non autorisé ou un autre tenant ne peut rien annuler.
5. Recréer une commande puis livrer une unité : usage toujours `REQUESTED`. Livrer la deuxième : usage `CONSUMED` exactement une fois, sans double sortie de stock. Refuser un fulfillment de type service, une mauvaise réserve ou un replay concurrent.
6. Vérifier relation révoquée, quota concurrent POS/omnicanal, devise et écart de précision tarifaire. Refaire les scénarios POS remises/retours, Gaming Checkout, affichages FR/EN, mobile et thème sombre.

Le retour/remboursement d'une commande omnicanale **après livraison** et les types `CASHBACK/CREDIT/LOYALTY/DELIVERY` feront l'objet de travaux distincts avant clôture de #886.

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

**La PR historique du premier incrément a fermé #888. La PR #902 ne peut fermer que #903 : ne pas fermer #886 ni #785** sur cet incrément. Les autres objectifs exigent des adaptateurs métier canoniques et des E2E complémentaires ; les effets financiers ne seront pas simulés dans une couche parallèle.
