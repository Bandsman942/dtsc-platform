# Hotfix #1186 — Auto-approbation RETAIL, annulation payée et audit FR/EN

**Date :** 15 novembre 2026 · **Version candidate :** 1.18.2 · **Branche :** `fix/1186-retail-self-approvals-returns-audit-i18n`

**Statut :** travaux sur branche candidate. Aucun E2E propriétaire, fusion `main` ni déploiement Vercel tant que la validation n'est pas donnée.

## Objectif métier

Un propriétaire peut attribuer dans **POS > Accès des collaborateurs** deux droits distincts :
- `SELF_APPROVE_INVOICE` : le préparateur autorisé pourra être lui-même validateur désigné de **sa facture**, puis l'approuver dans le circuit Finance canonique avant émission par le gérant / Finance selon les droits existants.
- `SELF_APPROVE_PAYMENT` : le caissier autorisé pourra se désigner sur **son encaissement**, soumettre puis approuver son paiement dans le POS. **APPROVED ≠ CONFIRMED** : la confirmation, l'allocation, la caisse et la comptabilité utilisent toujours les mécanismes Finance existants.
- `SELF_APPROVE_INVOICE_RETURN` : uniquement pour le **MANAGER**, avec `REQUEST_INVOICE_RETURN` et `APPROVE_INVOICE_RETURN`. Le gérant peut soumettre et approuver sa propre demande d'annulation/retour d'une **facture encaissée** sans acquérir de droit Finance général. Il ne peut pas inspecter lui-même les articles retournés ni préparer ou liquider lui-même le remboursement. Lors de la préparation Finance, un **validateur Finance distinct** est choisi explicitement pour les pièces d'avoir et de remboursement ; sa capacité Finance et sa portée boutique sont revérifiées. La liquidation demeure indépendante.

Toutes ces exceptions sont **OFF par défaut**, explicitement accordées ou révoquées par un membre `OWNER` de l'entreprise seulement, et attachées à un **unique utilisateur et boutique**. La politique impose `siteStaffIsolationEnabled` + `invoiceCheckoutEnabled`, affectation active, membre actif, prérequis par capacité et contrôles serveur au dépôt de la demande et à la décision. Les autres factures/secteurs/paiements conservent leur séparation habituelle.

## Annulation d'une facture encaissée

La facture existante reste **immuable historiquement** : l'annulation prend la forme d'une demande motivée de retour/avoir. Le moteur commun existant impose une inspection physique indépendante pour les articles, puis la préparation Finance, l'approbation des pièces d'avoir et de remboursement et la liquidation transactionnelle. La liquidation traite atomiquement les allocations, la créance, les journaux, la trésorerie et le stock ; aucun solde n'est modifié par l'approbation seule.

**Frontière actuelle du moteur :** retours de facture intégralement réglée (statuts `PAID` ou `CREDIT_NOTE`), stock livré. Les factures partiellement réglées et les factures sans flux de stock exigent un workflow Finance distinct, à ne pas simuler par `CANCEL` des factures payées.

## Audit et cohérence

Les journaux canoniques conservent leurs codes techniques stables et se traduisent seulement à l'affichage et à l'export en langue paramétrée `fr`/`en` ; événements d'affectation, factures, encaissements, annulations, statuts, risques et motifs. Les détails techniques restent visibles sur demande avec identifiant, trace et `metadata` (y compris délégations avant/après, site, utilisateur, finance).

## Recette E2E propriétaire demandée

1. Deux boutiques A et B : le propriétaire affecte Alice à A en facturation+encaissement ; cocher uniquement `SELF_APPROVE_INVOICE` et préparer une facture A.
2. Soumettre la facture en se désignant ; retrouver dans « À valider par moi », approuver ; vérifier le statut Finance **APPROVED**, puis émission et écritures via le gérant habilité.
3. Recommencer avec `SELF_APPROVE_PAYMENT` en A ; préparer, soumettre, approuver son propre paiement ; confirmer ensuite par Finance avant allocation ; contrôler créance, caisse, trésorerie et absence de doublons.
4. Retirer le droit d'Alice ; vérifier qu'une décision précédemment assignée ne passe plus. Tester usurpation, utilisateur B, affectation inactive et absence de souscriptions : refus 403.
5. En boutique A, gérant Bruno avec droits RETAIL de demande et d'auto-validation des retours, **sans droits de validation Finance** : demander une annulation de facture payée avec motif et se désigner comme approbateur. Contrôler **inspection indépendante par Chantal**, puis décision de Bruno. Le préparateur Finance choisit David comme approbateur Finance des avoirs/remboursements ; un autre collaborateur liquide. Comparer stock/avoir/remboursement/comptabilité.
6. Tester le refus de liquider par Bruno lui-même et le non-déclenchement du remboursement à l'approbation seule.
7. Administration entreprise > Audit et cohérence : en FR puis EN, vérifier événements, détails des permissions, acteurs, boutique, pièces Finance, filtres et export ; codes source inchangés.
8. Desktop, Android 320/360/390/414 px, mode clair/sombre, clavier et notifications contextualisées.

## Preuves automatisées

Le script `pnpm qa:hotfix-1186-retail-access` valide **des contrats source statiques**, non un test d'intégration. `pnpm qa:hotfix-1186-retail-behavior` teste les décisions et révocations des délégations par boutique dans un environnement isolé (sans écriture en base réelle), ainsi que la localisation des événements. `Quality gates`, `Migration`, scripts RETAIL existants, `type-check`, `lint`, `build` et E2E propriétaire sont obligatoires avant merge. Aucune migration Prisma ni nouvelle variable d'environnement. Aucun déploiement manuel Vercel.

## Retour arrière

Ne pas fusionner si CI/E2E KO. Après release éventuelle, révoquer les délégations depuis le POS (aucune perte de données) ; si correctif indispensable, PR de suivi avec nouveaux tests. **Ne jamais supprimer ou décomptabiliser une facture payée ni effacer les journaux.**
