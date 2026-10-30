# PUBLIC-UX-07 — Certification DTSC Public Experience V2

## Périmètre
Ce hotfix de certification couvre le site public DTSC après réconciliation des hotfixes #967, #968, #969, #970, #971 et #972. Aucun changement de DB de production ni de droit utilisateur n'est introduit.

## Automatisation
- pnpm qa:public-experience-v2 : vérification des contrats statiques et du branchement navigateur.
- pnpm exec playwright test tests/e2e/public-experience-v2.spec.mjs : exécution uniquement sur une instance locale isolée, avec enregistrement synthétique supprimé à la fin.
- Parcours : Ressources, recherche, filtres, lecture d'articles, images non recadrées, blocage des scripts et URL externes sûres, WCAG avec axe et 7 largeurs (320 à 1440 px).

## Contrôles manuels OWNER_E2E à exécuter
Accueil et CTA conseil/produit; header compact desktop/mobile clavier Escape et focus; ressources et catégories, pagination >12; article long, image carrée, tableau, vidéo, commentaires; Studio brouillon, aperçu, publication, édition, fermeture non sauvegardée et RBAC; FR/EN et clair/sombre; app, console, compte, support; contrôle des références commerciales authentiques.

## Performance (objectifs, pas valeurs mesurées)
LCP <= 2,5s; INP <= 200ms; CLS <= 0,1. Mesurer réellement après livraison via Lighthouse, Web Vitals et tests sur téléphone. Il serait incorrect d'annoncer un score avant cette mesure.

## Gouvernance
Pas de fusion ni déploiement des PR lorsque OWNER_E2E requis et non confirmé. Main-only, aucun déploiement de branche. Consigner Quality, Migration, acceptance, SHA main, Vercel READY et release GitHub. Rollback par revert ciblé.
