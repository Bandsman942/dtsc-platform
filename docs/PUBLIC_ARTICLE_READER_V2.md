# PUBLIC-UX-05 — Lecture éditoriale ouverte (Issue #971)

## Première implémentation
Les articles publics ne sont plus placés dans la carte dtsc-card. Un en-tête léger et une colonne éditoriale d'environ 768 px remplacent la grande bannière dégradée. Les images en contenu riche sont désormais rendues selon leurs proportions naturelles, sans recadrage cover.
Les tableaux ont un défilement horizontal local seulement si requis. Les commentaires et interactions existants restent fonctionnels.

## Compatibilité et dépendances
Aucun changement de schéma, API, permissions ou contenu en base.
Le hotfix #967 corrige les dates et la sanitation; sa fusion sur main doit être réconciliée sans écraser ses changements.
À compléter dans la même Issue : table des matières, temps de lecture, métadonnées Article individuelles, séparation visuelle de la zone de réactions, agrandissement d'images et tests de lecture réelle.

## QA
Vérifier desktop, mobile 320/360/375/390/414/768/1024, FR/EN, clair/sombre, images carrées, schémas, liens, tableaux, contenus longs, commentaires et partage.
Contrôles CONTRIBUTING requis, E2E propriétaire nécessaire avant merge. Production uniquement depuis main; rollback par revert ciblé.
