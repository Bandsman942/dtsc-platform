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
- Refuser toute situation où des contrepassations déjà enregistrées dépasseraient le montant d'origine EARN, plutôt que de masquer silencieusement une anomalie de ledger.

## Preuves et suites

- Contrôle statique : `pnpm qa:hotfix-917`; inscrit dans `qa:regression`.
- Playwright #914 étendu : deux ordres paiement/livraison continuent d'attribuer; troisième parcours retire l'audience CUSTOMER après réservation; quatrième lance **allocation et livraison en concurrence** et vérifie un seul EARN; cinquième expire le bénéfice avant la double preuve et vérifie l'absence de crédit et d'écriture. Un sixième scénario alloue partiellement le paiement puis le complète : aucun avoir n'est créé avant la totalité, et un seul est créé après le solde.
- QA CI/Playwright/OWNER_E2E #917 : **NOT_EXECUTED** avant publication de la branche.
- Reste dans #917 : preuves bout en bout de multi-remboursements partiels/intégraux, solde négatif, périodes Finance bloquées, concurrence multi-navigateurs avec retries et cross-tenant. Le scénario parallèle ajouté ne suffit pas à certifier toutes ces dimensions. **La PR ne ferme pas #917 tant que ces scénarios et l'E2E propriétaire ne sont pas certifiés**.

## Sécurité, migration, rollback

Pas de nouvelle table, aucune migration, aucun backfill ni secret. Le refus fail-closed peut maintenir des réservations historiques non éligibles; ne jamais attribuer automatiquement un avoir rétroactif. Rollback par revert contrôlé puis Production sur `main`, sans suppression d'écritures POSTED.
