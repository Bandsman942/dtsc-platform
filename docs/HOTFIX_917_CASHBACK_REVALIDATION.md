# Hotfix #917 — Révalidation tardive du cashback omnicanal

**Statut : pré-certification, PR brouillon, ne pas déployer avant OWNER_E2E #917.** Parents #886 et #785; `main@a7d413a` comme référence.

## Anomalie P0 vérifiée sur #914

Le moteur `tryGrantRetailOmnichannelCashbackTx` vérifiait la relation active, le montant, le tiers et le paiement/livraison, mais **ne recalculait pas l'audience, l'attribution, les conditions du panier, les fenêtres temporelles, les quotas ni les entitlements d'abonnement** entre `REQUESTED` et `EARN`. Un client dont l'audience était retirée après la commande pouvait donc recevoir ultérieurement un avoir sur paiement tardif.

## Correctif

- Conserver à la réservation un instantané minimal du contexte d'exécution (articles, catégories, quantité, date au format ISO), sans donnée médicale, secret ou nouveau solde.
- Au moment de la double preuve Finance/Sales, recalculer l'éligibilité depuis les audiences, attributions, règles et limites **courantes** via `evaluateRelationshipBenefitSnapshot`.
- Exclure uniquement la réservation actuelle de son propre décompte de quotas; conserver les autres demandes/consommations actives.
- Recontrôler `canUseModule` pour Retail et Avantages afin que la désactivation d'un abonnement ne laisse pas attribuer de nouveau crédit.
- Si une règle ne peut pas être vérifiée, laisser la réservation en attente sans `EARN`; aucune écriture sans droit courant.
- Conserver le ledger `EnterpriseRetailStoredValue*`, l'idempotence et le posting comptable atomiques.
- Les transactions Finance Allocation et Sales Fulfillment utilisent désormais un retry **borné et limité aux erreurs P2034 / conflits de sérialisation**, afin de supporter des événements simultanés sans double mutation; les erreurs métier ne sont jamais retriées.
- Refuser toute situation où des contrepassations déjà enregistrées dépasseraient le montant d'origine EARN, plutôt que de masquer silencieusement une anomalie de ledger.

## Recette réelle de remboursement à trois acteurs (#917)

Le test PostgreSQL/Playwright `#917 real partial then full omnichannel refunds` est ajouté dans `tests/e2e/issue-786-relationship-benefits-enforcement.spec.mjs`. Il crée un compte de **troisième membre uniquement dans la base isolée CI** pour séparer demandeur, validateur et acteur de règlement. Le paiement client est confirmé, alloué, puis la commande livrée via les routes canoniques ; l'avoir est émis une seule fois.

Le test déclenche ensuite deux retours de quantité 1/2 sur cette commande, chacun par demande Retail → approbation indépendante → préparation Finance → approbation indépendante du paiement et de l'avoir → règlement Finance par le troisième acteur → confirmation de paiement/refund. Il affirme, **après chaque remboursement confirmé**, la contrepassation POSTED équilibrée, l'idempotence du rejeu de règlement, l'état CONSUMED après le premier et CANCELLED après le second, et l'absence de double réversion. Il tente aussi de dépenser au préalable l'avoir disponible pour contrôler le solde négatif légitime.

**Preuve d'exécution de ce nouveau scénario : NOT_EXECUTED à l'instant de cette modification**, ne pas transformer une écriture de test en certification. Un échec de parcours est bloquant pour #917.

## Preuves et suites

- Contrôle statique : `pnpm qa:hotfix-917`; inscrit dans `qa:regression`.
- Playwright #914 étendu : deux ordres paiement/livraison continuent d'attribuer; troisième parcours retire l'audience CUSTOMER après réservation; quatrième lance **allocation et livraison en concurrence** et vérifie un seul EARN; cinquième expire le bénéfice avant la double preuve et vérifie l'absence de crédit et d'écriture. Un sixième scénario alloue partiellement le paiement puis le complète : aucun avoir n'est créé avant la totalité, et un seul est créé après le solde. Un septième vérifie qu'un paiement encore DRAFT ne peut être alloué ni crédité avant sa confirmation. Un huitième place une demande de retour `PENDING_APPROVAL` sur la commande avant l'allocation finale et constate l'absence d'EARN (donnée Finance de test, **pas** un remboursement effectivement confirmé).
- QA CI/Playwright/OWNER_E2E #917 : **NOT_EXECUTED** avant publication de la branche.
- Reste dans #917 : faire réussir la nouvelle recette réelle de multi-remboursements partiels/intégraux avec solde négatif, puis documenter les preuves des périodes Finance bloquées, de la concurrence multi-navigateurs avec retries et du cross-tenant. Le scénario parallèle ajouté ne suffit pas à certifier toutes ces dimensions. **La PR ne ferme pas #917 tant que ces scénarios et l'E2E propriétaire ne sont pas certifiés**.

## Sécurité, migration, rollback

Pas de nouvelle table, aucune migration, aucun backfill ni secret. Le refus fail-closed peut maintenir des réservations historiques non éligibles; ne jamais attribuer automatiquement un avoir rétroactif. Rollback par revert contrôlé puis Production sur `main`, sans suppression d'écritures POSTED.
