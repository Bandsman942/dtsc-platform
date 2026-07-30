# Expérience standard des modules DTSC

## Objectif

Ce chantier homogénéise les modules privés courants sans modifier leurs modèles Prisma, leurs permissions ou leurs règles métier. Il couvre quatre contrats réutilisables :

1. les KPI restent un rail horizontal tactile sur mobile ;
2. les modules standards partagent la même architecture workspace ;
3. les notifications liées à une entité ouvrent directement cette entité ;
4. les commentaires sont repliables et les images d'annonces disposent d'une visionneuse plein écran.

## Modules standardisés

Les pages suivantes utilisent désormais `ModuleWorkspace`, `ModuleHeader`, `ModuleMetrics`, `ModuleContent` et `ModuleSection` :

- Dashboard ;
- Notifications ;
- Annonces ;
- Entreprise ;
- Abonnement ;
- Support ;
- Paramètres ;
- Profil.

Cette architecture ne remplace pas les composants métier internes. Elle fournit la hiérarchie, les KPI, les sections et les règles responsive communes.

## Rail KPI mobile

`components/workspace/module-metrics.tsx` applique le contrat suivant :

- `flex-nowrap` et `overflow-x-auto` sur mobile et tablette ;
- `touch-pan-x`, `overscroll-x-contain` et snap horizontal ;
- largeur bornée de chaque indicateur ;
- scrollbar masquée sans désactiver le défilement ;
- passage en grille uniquement au breakpoint `lg`.

Le rail reste local : il ne doit jamais créer un scroll horizontal de page.

## Politique de destination des notifications

`lib/notification-targets.ts` centralise les builders de cibles :

- annonce et commentaire d'annonce ;
- publication publique et commentaire ;
- ticket et message support ;
- activité ;
- conversation collaborative ;
- module Enterprise ;
- administration ;
- calendrier.

`lib/notifications.ts` normalise toutes les destinations avant persistance et avant envoi Web Push. Seules les URLs internes commençant par `/` sont acceptées. Une URL absente ou invalide retombe sur `/notifications`.

Les nouvelles notifications d'annonces, de commentaires d'annonces, de transferts, de signalements, de publications et de tickets support incluent l'identifiant de l'entité. Les anciennes notifications conservées en base peuvent encore pointer vers une racine de module ; elles restent compatibles grâce au fallback.

### Routes exactes introduites

- `/announcements/[id]` affiche une annonce isolée et peut ouvrir `?commentId=...` ;
- `/ressources/[slug]?commentId=...` déplie et met en évidence le commentaire public ;
- `/support?ticketId=...&messageId=...` positionne le ticket concerné ;
- la liste Notifications marque la notification comme lue puis navigue directement vers `targetUrl`.

Les pages continuent d'appliquer leurs contrôles d'accès habituels. Une URL précise ne contourne ni le contexte actif, ni le membership, ni le RBAC.

## Commentaires repliables

`components/workspace/collapsible-thread.tsx` fournit le contrôle partagé :

- libellé Afficher/Masquer ;
- compteur ;
- `aria-expanded` et région associée ;
- ouverture forcée lorsqu'une action de réponse, modification ou suppression l'exige.

Les annonces et publications publiques conservent leur mécanisme existant équivalent. Les commentaires Activités DTSC et Enterprise Core utilisent la primitive partagée. Les fils restent bornés et paginés lorsqu'une pagination existe.

## Visionneuse d'images des annonces

`AnnouncementMediaEnhancer` intercepte les images du contenu riche dans `data-announcement-media-root` et ouvre un overlay plein écran :

- ratio original conservé avec `object-contain` ;
- image source non recadrée ;
- zoom de 50 % à 300 % ;
- réinitialisation du zoom ;
- fermeture via bouton, clic extérieur ou touche Échap ;
- blocage temporaire du scroll de page ;
- safe areas mobile et scroll interne de l'image zoomée.

La visionneuse est montée dans le fil d'annonces et dans la page d'annonce ciblée.

## Qualité et CI/CD

Le script `pnpm qa:standard-experience` vérifie automatiquement :

- les huit pages standardisées ;
- le rail KPI horizontal mobile ;
- la navigation directe des notifications ;
- les builders et producteurs de cibles précises ;
- les commentaires repliables ;
- la visionneuse des annonces.

Il est intégré à `pnpm qa:regression`. Le pipeline conserve les étapes existantes : diff checks, Prisma generate, type-check, QA, lint, build et migrations depuis une base vide. Vercel continue de déployer uniquement la branche `main` en Production.
