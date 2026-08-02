# ERP professionnel — Actifs et maintenance

## Périmètre

Module canonique : `ASSETS_MAINTENANCE`.

## Fiche actif

- Référence, catégorie, nom, description et numéro de série.
- Fournisseur, acquisition, valeur indicative, devise et garantie.
- Site, emplacement et responsable.
- État, statut, affectations, incidents, maintenances et historique.

## Cycle d’affectation

```text
Disponible → Affecté → Retourné → Disponible
```

Une seule affectation active est permise. L’état au départ, le retour attendu, l’état au retour et les notes restent historisés.

## Maintenance

- Préventive ou corrective.
- Priorité, responsable et fournisseur.
- Date prévue, échéance, coût indicatif et résultat.
- Transitions planifiée, en cours, terminée ou annulée.

## Incidents

- Type, titre, description et gravité.
- Date, déclarant et responsable.
- Statut ouvert ou résolu.
- Résolution conservée.
- Possibilité métier de mettre l’actif hors service via les transitions prévues.

## Frontière comptable

Un actif opérationnel n’est pas automatiquement une immobilisation comptable. Toute projection vers Finance doit passer par une règle explicite et le moteur commun.

## Rollback

Un rollback peut masquer une nouvelle action ou bloquer les écritures, mais ne supprime jamais affectation, retour, maintenance ou incident.

## Maturité

`PROFESSIONAL_READY` après Quality Gates et déploiement ; validation E2E manuelle requise avant `COMMERCIAL_READY`.
