# ERP professionnel — Paie opérationnelle

## Périmètre

Module canonique : `PAYROLL_OPERATIONS`.

Chaîne : période → population → contrats actifs → temps approuvé → variables → calcul → contrôle → soumission → approbation → bulletins.

## Frontières

- Paie calculée ≠ paiement effectué.
- Bulletin ≠ transaction bancaire.
- Temps approuvé ≠ paie.
- Annulation ≠ suppression.

## Assistant de paie

1. Ouvrir ou sélectionner une période.
2. Sélectionner la population éligible.
3. Charger les contrats actifs.
4. Charger le temps approuvé.
5. Ajouter primes et retenues justifiées.
6. Calculer côté serveur.
7. Examiner les anomalies.
8. Soumettre à un approbateur distinct.
9. Approuver ou rejeter.
10. Générer les bulletins privés.

## Contrôles serveur

- Contrat manquant ou inactif.
- Devise incohérente.
- Période déjà utilisée par une paie active.
- Doublon de collaborateur.
- Retenue supérieure au brut disponible.
- Auto-approbation interdite.
- Révision concurrente.

## Annulation et recréation

Une paie `CANCELLED` reste conservée mais ne bloque pas une nouvelle paie active pour la même période. Il reste interdit d’avoir deux paies actives pour la même population et la même période.

## Bulletins

- Isolés par entreprise et collaborateur.
- Accessibles uniquement aux permissions autorisées.
- Conservés après révocation selon les obligations applicables.
- Non accessibles via un compte dont la relation a été révoquée.

## Maturité

`PROFESSIONAL_READY` après Quality Gates et déploiement. `COMMERCIAL_READY` uniquement après validation fonctionnelle manuelle du propriétaire.
