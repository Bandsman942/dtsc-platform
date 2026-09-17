# OWNER E2E #657 — secteurs, navigation ERP et workspaces

## Préconditions

- tester le SHA final exact de la PR #657 ;
- aucune Preview Vercel n'est requise ni autorisée pour la branche ;
- disposer d'un compte Administration DTSC autorisé et d'au moins une entreprise cliente avec accès ERP ;
- tester au minimum en français puis en anglais, mode sombre puis clair.

## 1. Création d'entreprise — secteurs

1. Ouvrir Administration DTSC > Entreprises clientes.
2. Ouvrir `Créer l'entreprise cliente`.
3. Sans saisir de recherche dans `Secteur d'activité`, faire défiler la liste.
4. Vérifier que tous les secteurs actifs restent accessibles, notamment `Industrie / production` et `Hôtellerie / restauration / événementiel`.
5. Choisir `Industrie / production` et vérifier que `Couture, confection & habillement` (`TAILORING_APPAREL`) est proposé comme sous-type actif.
6. Revenir au secteur puis choisir `Hôtellerie / restauration / événementiel` et vérifier que `Salle de jeux / Gaming Lounge` (`GAMING_LOUNGE`) est proposé.
7. Vérifier que la liste reste dans le formulaire, verticalement scrollable, sans débordement horizontal de page.

## 2. Navigation Entreprise & ERP

1. Ouvrir une entreprise cliente active.
2. Ouvrir `Entreprise & ERP`.
3. Vérifier que seuls les sous-groupes de navigation de haut niveau sont présents : `Entreprise & relations`, `Espaces entreprise`, `Offre & abonnement` selon les droits.
4. Déplier `Espaces entreprise`.
5. Vérifier l'entrée `Modules ERP` et l'absence d'un deuxième catalogue direct `Opérations`, `Ventes & relation client`, `Achats & ressources`, etc. sur cette page.
6. Ouvrir `Modules ERP`.
7. Vérifier l'arrivée sur `/enterprise-modules` et la présence du catalogue ERP autorisé par groupes métier.
8. Ouvrir un module ERP depuis ce catalogue et vérifier que le deep-link fonctionne sans élargissement des permissions.

## 3. Administration et abonnement

- `Administration entreprise > Modules` reste l'endroit de gestion/activation des modules ;
- `Administration entreprise > Abonnement & limites` reste distinct ;
- `Offre & abonnement` reste distinct du catalogue `Modules ERP` ;
- aucune donnée privée d'une autre entreprise ne devient visible.

## 4. Workspaces

Échantillonner au moins un module de chaque archétype réellement disponible :

- standard professionnel : par exemple RH, CRM, Stock ou Finance ;
- suite intégrée : Manufacturing ou Tailoring ;
- transactionnel : Retail ou Gaming ;
- administration/gouvernance : Administration entreprise ou Identités & consentements ;
- IA immersive : IA Assistant Entreprise.

Vérifier que le contenu métier reste spécialisé mais que les comportements communs sont cohérents : header DTSC, actions, métriques lorsque pertinentes, listes/formulaires, aide, erreurs lisibles, navigation retour et responsive.

## 5. Responsive et thèmes

Rejouer les parcours critiques en 320, 360, 375, 390 et 414 px, puis tablette/desktop. Vérifier :

- aucun scroll horizontal global ;
- formulaire de création verticalement scrollable ;
- boutons et sélecteurs tactiles ;
- aucune action principale masquée ;
- clair/sombre lisibles ;
- FR/EN cohérents.

## Validation propriétaire

Après validation manuelle du SHA final exact, répondre dans la conversation :

`E2E #<PR> bon`

Cette confirmation est distincte de la CI et reste obligatoire avant Ready/Merge.