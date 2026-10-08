# Hotfix #783 — Découvrabilité de Relations & avantages

## Problème

Le module `RELATIONSHIP_BENEFITS` possède un workspace métier dédié à `/enterprise-relationship-benefits`, mais deux défauts rendaient son accès difficile à trouver :

- le panneau **Administration entreprise → Modules** reconstruisait une route générique `/enterprise-modules/<code>` au lieu de consommer la destination canonique résolue ;
- les surfaces naturelles **Entreprise & ERP** et **Administration entreprise** n’exposaient pas de raccourci suffisamment visible vers **Relations & avantages**.

## Contrat corrigé

La source de vérité reste le registre ERP canonique et son résolveur de navigation :

```text
registre canonique
→ tenant module actif
→ abonnement / entitlement
→ permission utilisateur
→ getEnterpriseNavigationModules()
→ href canonique
→ UI
```

Aucun raccourci ne fabrique sa propre URL métier. Une destination n’est visible que si le résolveur serveur la renvoie pour l’utilisateur courant.

## Parcours entreprise

Lorsque `RELATIONSHIP_BENEFITS` est réellement autorisé :

1. **Entreprise & ERP** affiche un raccourci **Relations & avantages** dans l’en-tête du groupe ;
2. **Administration entreprise** affiche **Relations & avantages** dans son rail de navigation secondaire ;
3. **Administration entreprise → Modules → … → Ouvrir le module** utilise exactement la destination canonique renvoyée par le résolveur ;
4. la destination finale est `/enterprise-relationship-benefits`.

Si le module est désactivé, absent du plan ou refusé par les permissions, ces raccourcis ouvrables ne sont pas exposés.

## Données et sécurité

Aucune migration et aucun changement Prisma.

Le hotfix ne modifie pas les règles de sécurité du moteur d’avantages. Les raccourcis utilisent uniquement des destinations déjà autorisées par `getEnterpriseNavigationModules()`. Le workspace cible conserve ses propres contrôles serveur.

## OWNER_E2E requis

Statut initial : **NOT_EXECUTED**.

1. Utiliser une entreprise BUSINESS+ avec `RELATIONSHIP_BENEFITS` actif.
2. Ouvrir **Entreprise & ERP** et vérifier la présence du raccourci **Relations & avantages**.
3. Ouvrir le raccourci et vérifier l’arrivée sur le workspace dédié.
4. Ouvrir **Administration entreprise** et vérifier le raccourci **Relations & avantages**.
5. Dans **Administration entreprise → Modules**, ouvrir le menu de **Relations & avantages**, puis **Ouvrir le module** ; vérifier la même destination dédiée.
6. Tester un utilisateur dont le resolver refuse `RELATIONSHIP_BENEFITS` : aucun raccourci ouvrable ne doit être affiché.
7. Vérifier FR/EN, clair/sombre et les largeurs 320, 360, 375, 390, 414, 768 et 1024 px.
8. Vérifier qu’aucune autre carte de module n’a changé de destination.

La PR ne doit pas être fusionnée avant confirmation OWNER_E2E.
