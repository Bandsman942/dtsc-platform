# PUBLIC-UX-02 — Navigation et typographie publiques (#968)

## Scope de cette première passe
Le header desktop regroupe les destinations publiques par Solutions, Plateforme, Secteurs, Ressources et Entreprise. Le menu utilise des boutons expansibles et des liens réels, avec fermeture au clic extérieur, à Escape et au changement de route.
La navigation mobile existante reste disponible. Hauteur réduite du header public et graisse des classes de typographie centralisées assouplie.
Couleurs officielles conservées; aucun changement sur les chemins auth, app, console et support.

## QA / acceptation encore nécessaire
Rendu visuel réel aux largeurs 320, 360, 375, 390, 414, 768, 1024, 1280 et 1440 px. Vérifier focus clavier, tabulation, ordre des liens, menus déroulants, navigation sans JavaScript (les liens du footer restent accessibles), dark mode, localisation, contraste et SSO.
Faire passer les gates de CONTRIBUTING et confirmer l'E2E propriétaire avant merge. Les tests ne sont pas déclarés réussis par une simple inspection de code.

## Hors scope
Refonte mobile approfondie, sections du site et direction artistique complète restent dans cette Issue avant fermeture; la home commerciale et le catalogue ont leurs Issues dédiées #969 et #970.
Rollback sans migration: revert des commits propres à #968, déploiement uniquement depuis main.
