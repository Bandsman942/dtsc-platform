# ERP professionnel — Temps, présence et congés

## Périmètre

Module canonique : `TIME_ATTENDANCE`.

## Concepts séparés

```text
disponibilité
≠ absence
≠ présence
≠ temps déclaré
≠ temps approuvé
≠ paie
```

L’interface rapproche ces informations sans les fusionner.

## Congés

- Type de congé.
- Période complète ou demi-journée.
- Motif et approbateur.
- Soumission, approbation, refus et annulation selon le workflow serveur.
- Contrôle des chevauchements.
- Intégration au calendrier sans transformer le congé en présence.

## Feuilles de temps

- Collaborateur et période.
- Projet ou activité.
- Date et durée.
- Pause, caractère facturable, description et notes.
- Soumission à un approbateur distinct.
- Temps approuvé verrouillable pour la paie.

## Présence

Le module affiche les informations disponibles dans le modèle actuel : absences, exceptions, temps déclaré et temps approuvé. Aucun système matériel de pointage n’est inventé par cette itération.

## UX mobile

- Formulaires plein écran.
- Sélecteurs métier.
- Saisie de durée avec clavier numérique.
- Listes tactiles et statuts localisés.
- Aucun UUID ni enum brute.

## Sécurité

- Collaborateur, projet et approbateur validés dans la même entreprise.
- Périodes verrouillées non modifiables.
- Approbation indépendante.
- Audit des décisions.

## Maturité

`PROFESSIONAL_READY` avec validation E2E manuelle encore en attente.
