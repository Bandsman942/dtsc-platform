# Guide utilisateur — Consolidation ERP finale

## Objectif

Ce guide explique la continuité entre modules, sans remplacer les guides de chaque métier.

## Utilisation

1. Créez les référentiels avant les opérations : tiers, catalogue, sites et comptes.
2. Utilisez les sélecteurs recherchables ; aucun UUID ne doit être saisi.
3. Ouvrez les objets liés depuis la fiche : le lien croisé conserve l’objet, l’onglet et le retour.
4. Effectuez les transitions avec les actions proposées selon le statut et vos capacités.
5. Chargez les pièces via l’upload documentaire et choisissez la classification adaptée.
6. Utilisez les commentaires pour les échanges ; utilisez les boutons de décision pour approuver, rejeter ou demander une correction.
7. Dans **Vue d’ensemble financière**, consultez **Continuité inter-module**. Une projection en échec affiche une erreur métier, la source, la cible éventuelle et, pour les gestionnaires, l’action de reprise.

## Erreurs fréquentes

- Une référence absente signifie généralement qu’elle est inactive, hors tenant, incompatible avec le statut ou non autorisée.
- Une période fermée bloque la comptabilisation.
- Une relance idempotente conserve l’objet existant ; elle ne crée pas de doublon.
- Un accès sensible refusé après révocation est attendu.

## Mobile

À 320 px, 360 px, 390 px et 412 px : les KPI et rails restent en défilement horizontal, les formulaires utilisent une vue plein écran, les tableaux volumineux basculent vers des cartes et l’action principale reste accessible sans masquer le clavier.

## Français et confidentialité

Les enums et codes sont traduits en message utilisateur. Les détails médicaux ne quittent pas Health. Les montants RH sensibles ne sont visibles qu’avec la capacité correspondante.

Les liens croisés sont testés en français et en anglais. Sur mobile, le rail horizontal garde l’élément actif visible.
