# Harmonisation E2E — Administration DTSC et Support

Date : 2026-08-05
Périmètre : retours E2E propriétaire après l’itération 7 des modules standards.

## 1. Expérience produit commune

Administration DTSC et Support utilisent désormais la primitive partagée `ProductSectionNavigation`.

Le contrat impose :

- les mêmes cartes, icônes, espacements, états actifs et contrastes ;
- une navigation regroupée par finalité métier sur ordinateur ;
- un déclencheur mobile compact, un dialogue défilable, la safe-area et les mêmes interactions tactiles ;
- une largeur minimale compatible 320 px ;
- une navigation au clavier et des états `aria-current`, `aria-expanded` et `aria-modal`.

## 2. Architecture de l’information de la Console

Les sections sont regroupées sans modifier leurs routes canoniques :

| Groupe professionnel | Sections |
| --- | --- |
| Pilotage et gouvernance | Vue générale, maturité commerciale, visites, sécurité et audit |
| Clients, revenus et service | Entreprises clientes, abonnements, support |
| Identités et accès | Utilisateurs, RBAC |
| Contenus et engagement | Publications, bannières promotionnelles |
| Plateforme et technologie | Paramètres plateforme, CTO |
| Opérations internes DTSC | RH & CFO, SCO, COO, CEO, MPO, juridique |

Le regroupement est une taxonomie d’affichage. Il ne crée aucun droit. Les contrôles existants par capacité, bloc administratif et permission de poste restent appliqués côté serveur. Les mappings `CONSOLE_SECTION_GROUP`, `CONSOLE_SECTION_ADMIN_BLOCK` et `CONSOLE_SECTION_MODULE_CODE` deviennent les sources canoniques de cohérence entre navigation, RBAC et maturité commerciale.

## 3. Commentaires Support

Le terme « discussion » est remplacé par « commentaires » dans les tickets.

Le fil respecte le contrat commun :

- masquage/démasquage accessible avec `CollapsibleThread` ;
- chargement borné des commentaires antérieurs ;
- réponse, copie, modification et suppression logique ;
- zone multiligne : Entrée ajoute une ligne, le bouton Commenter publie ;
- mentions proposées depuis les participants connus et les agents Support autorisés ;
- clic sur une mention nominative ouvrant les actions professionnelles contextualisées ;
- affichage contextualisé de `@tous` sans accorder de permission supplémentaire.

La primitive `Input` fournit aussi une compatibilité multiligne aux compositeurs de commentaires historiques qui utilisaient encore une saisie monoligne.

## 4. Audit des guides utilisateur

L’inspection du registre canonique a montré que plusieurs modules et sous-modules routés possédaient une interface active mais un `userGuidePath` nul, notamment des espaces globaux, compte, entreprise, planning, coordination et Support.

La correction repose sur deux niveaux :

1. les guides métier exacts déjà disponibles restent prioritaires, notamment Calendrier, Activités DTSC et Support ;
2. tous les autres modules actifs ou bêta disposant d’une route reçoivent une couverture native de repli construite depuis leur définition canonique : description, domaine, politique d’accès, dépendances, abonnement et étapes professionnelles.

Le registre enrichi refuse désormais un module visible et routé sans guide exact ou couverture native. Le bouton de guide de repli est monté dans le shell privé et n’apparaît pas lorsqu’un guide exact est déjà affiché par l’interface.

## 5. Maturité commerciale

Le module Maturité commerciale lit le registre enrichi. Les cartes concernées reconnaissent donc la présence du guide natif et recalculent leurs critères satisfaits/manquants.

Aucune promotion automatique vers `COMMERCIAL_READY` n’est effectuée. Les modules de ce correctif restent au maximum `PROFESSIONAL_READY` tant que les conditions suivantes ne sont pas réunies :

- CI complète verte ;
- déploiement Production vérifié ;
- E2E manuel propriétaire rejoué sur mobile et ordinateur ;
- validation explicite du propriétaire ;
- preuve de production et de validation persistée dans le workflow de maturité.

## 6. Checklist E2E propriétaire à rejouer

### Administration DTSC

- ouvrir la navigation des sections à 320 px, 360 px, tablette et ordinateur ;
- vérifier les six groupes et l’absence de doublons ;
- tester chaque rôle/capacité et confirmer qu’un groupe visible ne donne aucun droit supplémentaire ;
- vérifier les routes canoniques, alias et conservation des filtres ;
- contrôler le Kanban de maturité et la présence des guides.

### Support

- créer un ticket et ouvrir son ancre directe ;
- masquer/démasquer les commentaires ;
- écrire plusieurs lignes avec Entrée puis publier avec le bouton ;
- répondre, modifier et supprimer un commentaire selon les droits ;
- mentionner un agent connu, cliquer son nom et tester profil, conversation, invitation calendrier et copie ;
- vérifier le comportement à 320 px et avec le clavier logiciel mobile.

Statut : **tests automatisés préparés — validation E2E propriétaire à rejouer après déploiement**.
