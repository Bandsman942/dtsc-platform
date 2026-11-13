# HEALTH-04 / #1149 — Socle de sécurité laboratoire/pharmacie (tranche 1)
Date 13/11/2026 · Non fusionné / aucune écriture Production.

## Correctifs
- Laboratoire : les demandes multi-examens exigeant plusieurs types d'échantillons sont refusées avec un message métier. Sans gestion des tubes/échantillons individuels, il serait dangereux de déclarer plusieurs analyses comme couvertes par un seul prélèvement. Les modifications du type d'échantillon d'une demande existante sont également vérifiées.
- Pharmacie interne : toute opération de stock est sérialisée sous `pg_advisory_xact_lock` par tenant/produit; la ligne `HealthPharmacyProduct` est relue après le verrou. Les sorties concurrentes ne peuvent plus consommer une quantité de référence lue avant la mutation d'un autre opérateur.
- Quantités non finies/négatives refusées, règles existantes de lots, disponibilité FEFO, péremption et restrictions des produits sensibles conservées.

## Limites bloquantes du reste de #1149
- [ ] Source unique : bascule contrôlée des quantités/lots/valorisations vers Inventaire ERP, sans dual-write ni double COGS; séparation des attributs cliniques Santé.
- [ ] Dispensation nécessitant plusieurs lots FEFO : comportement à concevoir avec mouvements par lot, prescription et facturation idempotente.
- [ ] Spécimens physiques multiples, étiquettes/barcodes, validations techniques/biologiques, résultats critiques et rapports signés.
- [ ] Couplage prescriptions structurées/ordonnances + pharmacie + stock + compte client/assurance.
- [ ] Tests PostgreSQL de concurrence stock réel et E2E multi-professionnels, multi-entrepôts et expiry business-date.

Aucune certification LIS, aucun mouvement ERP canonique revendiqué dans cette tranche. Les objets spécialisés Santé restent source provisoire tant que le cutover n'est pas autorisé.
