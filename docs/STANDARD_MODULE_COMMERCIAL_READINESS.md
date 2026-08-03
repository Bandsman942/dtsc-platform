# Maturité commerciale des modules standards

## Niveaux

- `BACKEND_READY` : backend principal présent, expérience insuffisante.
- `READ_ONLY_UI` : lecture disponible, opérations incomplètes.
- `OPERATIONAL_UI` : parcours principaux opérationnels, écarts professionnels restants.
- `PROFESSIONAL_READY` : contrats architecture, accès, UX, sécurité, documentation et QA satisfaits.
- `COMMERCIAL_READY` : validation manuelle explicite du propriétaire après Production.

## Séparation obligatoire

Le statut technique (`ACTIVE`, `BETA`, `PLANNED`, `HIDDEN`, `DEPRECATED`, `RETIRED`) ne détermine jamais automatiquement la maturité commerciale.

## Promotion commerciale

`COMMERCIAL_READY` exige : Quality Gates verts, Production issue de `main`, migrations et build stables, tests E2E manuels, validation explicite du propriétaire et preuve versionnée. Une PR de promotion séparée est recommandée.

## État de l’itération 1

Aucun module standard n’est promu vers `COMMERCIAL_READY`. Les niveaux initiaux du registre décrivent l’état observé des fondations et restent révisables par les itérations 2 à 8 sur preuves réelles.
