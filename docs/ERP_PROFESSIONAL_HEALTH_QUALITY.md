# Module professionnel Health — Incidents qualité

**Code canonique :** `QUALITY_INCIDENTS`
**Maturité :** `PROFESSIONAL_READY`
**Commercialisable :** non, validation manuelle en attente

## Parcours

```text
déclaration → qualification → gravité → analyse de cause
→ actions correctives → vérification → clôture
```

Le module gère type, service, date, déclarant, description, gravité, impact, patient lorsque strictement nécessaire, responsables, échéances, documents et statut.

## Expérience

Le workspace dédié présente file de traitement, recherche, filtres, détail, actions correctives, commentaires et historique. Les tableaux de bord privilégient les agrégats lorsque l’identification du patient n’est pas nécessaire.

## Confidentialité

L’accès aux données identifiantes du patient est limité. Les utilisateurs non autorisés voient un incident dépersonnalisé ou sont refusés. Les documents sensibles suivent les règles Health.

## Audit

Chaque transition, affectation, action corrective, validation et clôture est historisée. Une clôture ne supprime jamais le dossier.

## Validation

QA automatisée : modèles, workflow, actions, permissions, audit et responsive.
E2E propriétaire : confidentialité `I06-H-005` et campagne finale.
