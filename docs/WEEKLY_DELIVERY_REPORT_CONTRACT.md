# DTSC Platform — Weekly Delivery Status Contract

Le rapport du vendredi est généré uniquement depuis les sources structurées GitHub/Vercel.

## Structure officielle

1. État global
2. Progrès récents
3. Bugs non résolus
4. Mouvement des milestones
5. CI/CD
6. Déploiements Production
7. Blockers
8. Actions prioritaires

## Règles

- Progrès : PR mergées, Releases, Issues clôturées et déploiements Production depuis le rapport précédent ; pas chaque commit.
- Bugs : P0/P1 d’abord, puis P2 à impact matériel.
- Milestones : `closed / total`, pourcentage et variation si calculable.
- Blockers : `status:blocked`, CI rouge, Production failure, review bloquante, migration ou dépendance critique.
- Priorités : P0 → P1 → blockers → milestone courant → dépendances du chemin critique.
- Filtre matériel : inclure principalement `delivery-impact:high` et `delivery-impact:medium`; `low` seulement s’il explique une Release, un incident, une dette bloquante ou un mouvement significatif.
