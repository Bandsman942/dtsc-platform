# HEALTH-05 / #1150 — Facturation médicale : sécurité des paiements (tranche 1)
Date 2026-11-13 · Branche `fix/1150-health-billing-atomic` · Non fusionnée.

## Correctifs réalisés
- Toutes les actions sur une facture médicale sont sérialisées sous verrou transactionnel tenant/invoice `pg_advisory_xact_lock`.
- Paiements et annulations emploient désormais `Prisma.Decimal` et le helper `money`; le montant strictement positif et le solde disponible sont contrôlés dans la transaction.
- La référence confirmée d'un paiement est contrôlée contre les doublons sur la facture avant insertion.
- Les transitions de paiement et leur historique ne sont validés qu'une fois la mutation atomique effectuée.
- Le détail de facture retourne les références financières et les lignes nécessaires à la facturation, mais ne transmet pas automatiquement les objets de consultation, rendez-vous, laboratoire ou dispensation intégralement aux lecteurs non cliniques; commentaires internes et références de paiement privées sont masqués selon le droit existant.
- API : erreurs métier contextualisées (409) pour doublons, montant invalide et annulation incohérente.

## Limites / exigences du reste de #1150
- [ ] Certifier sur PostgreSQL la simultanéité des paiements et l'annulation; vérifier les références globales et ajouter idempotency-key serveur pour réseau instable.
- [ ] Enchaîner prestation -> validation -> émission -> créance -> paiement ERP -> comptabilité en source unique, avec cutover progressif et rollback sans dual-write.
- [ ] Synchroniser remboursements, avoirs, payeurs multiples, taux de change et fiscalité selon configuration.
- [ ] Unifier HIRMS, assurance et rapprochement des statuts externes : soumis ≠ approuvé ≠ payé.
- [ ] Tester vente/encaissement/COGS multi-boutiques RETAIL inchangés, et droits Finance/Clinique de Health.
- [ ] E2E final propriétaire après toutes les tranches.

Aucun déploiement Production et aucun E2E réel déclarés. Le verrou corrige l'interleaving; il ne constitue pas une certification financière complète.
