# Module professionnel Health — Laboratoire

**Code canonique :** `LABORATORY`
**Maturité :** `PROFESSIONAL_READY`
**Commercialisable :** non, validation manuelle en attente

## Parcours

```text
demande → prélèvement → analyse → résultat → vérification → validation → publication
```

Le module gère patient, prescripteur, examen, priorité, échantillon, dates, valeurs, unités, références, indicateur critique, validateur et document.

## Expérience

Le workspace dédié fournit recherche, filtres, détail, formulaire structuré, actions de progression et historique. Les résultats critiques sont visuellement signalés sans exposer leur contenu hors contexte sécurisé.

## Intégrité

Un résultat validé n’est pas modifié silencieusement. Toute correction passe par une action historisée. Les validations et publications sont contrôlées côté serveur et les références patient/consultation sont tenant-scoped.

## Notifications

Une alerte critique notifie les acteurs autorisés avec un message générique. Le détail n’est visible qu’après authentification, résolution du contexte et permission.

## Validation

QA automatisée : modèles dédiés, workflow, valeur critique, validation, audit, confidentialité et responsive.
E2E propriétaire : scénario `I06-H-003`.
