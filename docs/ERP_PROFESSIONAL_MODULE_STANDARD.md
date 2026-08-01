# Standard DTSC d’un module ERP professionnel

Version : 1.0  
Date d’entrée en vigueur : 1 août 2026  
Contrat machine : `ERP_PROFESSIONAL_MODULE_STANDARD_V1`

## 1. Objet

Ce document distingue cinq réalités qui ne doivent plus être confondues : backend existant, interface de consultation, interface opérationnelle, module professionnel et module commercialisable.

Le registre canonique reste l’autorité pour les codes, routes, icônes, ordre, plans, dépendances, permissions et statut d’implémentation. Le manifeste `lib/enterprise/module-commercial-readiness.json` ajoute uniquement l’évaluation produit. Il ne constitue ni une seconde navigation ni un second registre fonctionnel.

## 2. Définition obligatoire

Un module ERP professionnel possède, lorsque son métier l’exige :

1. une navigation canonique, déterministe et cohérente desktop/mobile ;
2. un tableau de bord fondé sur de vraies données, adapté au rôle et traduit ;
3. une liste avec recherche, filtres, tri, pagination, chargement, erreurs et état vide ;
4. un formulaire métier lorsque l’écriture existe côté serveur et que le rôle est autorisé ;
5. une fiche de détail avec relations, montants, dates, documents, commentaires, historique et lien profond ;
6. des transitions métier limitées par le rôle, le statut, la séparation des responsabilités et la concurrence ;
7. des libellés contrôlés en français et en anglais, sans enum ou erreur brute ;
8. une expérience mobile utilisable à 320, 360, 390, 412 px, tablette et desktop ;
9. l’isolation `organizationId`, les permissions serveur, l’entitlement, l’abonnement, la validation, l’audit et le rate limiting pertinent ;
10. des notifications ciblant l’objet et l’action utile ;
11. un contrat QA couvrant accès, lecture, écriture, cycle de vie, rôles, erreurs, deep links, langue et responsive.

Une route `POST` sans formulaire déclaré est une dette produit. Une liste générique n’est pas une preuve de maturité commerciale.

## 3. Niveaux de maturité

### `BACKEND_READY`

Les modèles, services ou routes existent. L’interface utilisateur n’est pas suffisante.

### `READ_ONLY_UI`

Les données sont consultables. Les opérations principales ne sont pas disponibles ou ne sont pas prouvées dans l’interface.

### `OPERATIONAL_UI`

Les flux principaux sont accessibles. Des lacunes UX, linguistiques, mobiles, documentaires ou de recette restent ouvertes.

### `PROFESSIONAL_READY`

Le standard fonctionnel, UX, sécurité et QA est satisfait. La validation de packaging, prix, support, documentation commerciale ou recette finale peut encore manquer.

### `COMMERCIAL_READY`

Tous les critères applicables sont satisfaits et prouvés. Le module peut être présenté comme complet dans une offre correspondante.

## 4. Promotion

La promotion de maturité est réalisée par modification revue du manifeste. Une promotion vers `COMMERCIAL_READY` exige :

- un override explicite du module ;
- une interface dédiée ;
- route et workspace vérifiables ;
- lecture et écriture si le métier est opérationnel ;
- formulaire, détail et actions métier ;
- permissions et audit ;
- dictionnaire de libellés ;
- preuve responsive ;
- contrat QA ;
- au moins une preuve code, une preuve API/service et une preuve QA ;
- aucun critère manquant ;
- `commercializable: true`.

Le script `pnpm qa:erp-commercial-readiness` bloque toute promotion injustifiée.

## 5. Déclassement

Un module doit être déclassé lorsqu’une régression invalide une preuve majeure : route cassée, écriture non exposée, permission contournable, fuite tenant, absence de formulaire, statut brut visible, expérience mobile inutilisable, QA supprimée ou dépendance non satisfaite.

Le déclassement ne supprime pas les données. Il corrige honnêtement la présentation produit et peut masquer l’offre commerciale concernée jusqu’au rétablissement.

## 6. Relation avec les plans

Le plan minimal du registre indique l’éligibilité commerciale. Il ne prouve pas la qualité du module. L’administration et les offres doivent utiliser conjointement :

- le registre canonique pour le plan et les dépendances ;
- le manifeste de maturité pour la readiness ;
- le résolveur d’accès pour l’organisation, l’abonnement, le secteur et les permissions.

Un module peut être inclus techniquement dans un plan tout en restant non commercialisable. Dans ce cas, il doit être présenté comme pilote, bêta, lecture seule ou non disponible selon la stratégie produit réelle.

## 7. Expérience DTSC obligatoire

Les surfaces réutilisent `components/workspace/*` : `ModuleWorkspace`, `ModuleHeader`, `ModuleMetrics`, `ModuleToolbar`, `ModuleContent`, `ModuleSection`, `BusinessList`, `BusinessListItem`, `StatusBadge`, `ContextActions` et `EmptyState` lorsque disponibles.

Les KPI conservent leur rail horizontal tactile sur mobile. Les mots ordinaires gardent leurs limites naturelles. La coupure agressive est réservée aux URL, emails, identifiants, noms de fichiers et chaînes externes explicitement marquées.

## 8. Responsabilités

- Produit : définit les critères et confirme la commercialisabilité.
- CTO/développement : fournit les preuves code, sécurité et qualité.
- COO/MPO : confirme le workflow et les critères d’acceptation métier.
- Support/commercial : confirme documentation, onboarding, limitations et support.
- CI : empêche une déclaration incohérente.

Aucun acteur ne peut contourner le contrat en modifiant uniquement un badge ou un test superficiel.
