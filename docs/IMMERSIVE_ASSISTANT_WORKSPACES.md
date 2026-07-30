# Workspaces immersifs Chatbot et IA Assistant Entreprise

## Objectif

Le Chatbot général et l'IA Assistant Entreprise utilisent désormais le même contrat de viewport immersif que le module Mes collaborateurs.

Le document de page ne défile plus verticalement sur mobile pendant l'utilisation de ces workspaces. Le scroll reste volontairement limité aux zones métier qui en ont besoin :

- liste des conversations et projets ;
- fil de messages ;
- onglets Sources, Historique, Usage et Paramètres de l'assistant entreprise ;
- dialogues et formulaires dédiés.

Le header de conversation et le composer restent ancrés dans le workspace.

## Architecture

Le composant `components/chat/assistant-immersive-workspace-shell.tsx` :

- appelle `useImmersiveConversationViewport()` ;
- verrouille `html`, `body` et `.dtsc-private-main` sur le `VisualViewport` mobile ;
- réutilise l'attribut historique `data-collaboration-immersive-root` afin de conserver le contrôleur de gestes déjà validé dans Mes collaborateurs ;
- distingue les variantes `chatbot` et `enterprise` ;
- impose une hauteur bornée et un `overflow` interne ;
- transforme les onglets non conversationnels de l'assistant entreprise en surfaces à scroll interne.

Les pages concernées sont :

- `app/chat/page.tsx` ;
- `app/enterprise-modules/[moduleCode]/page.tsx` lorsque `moduleCode === AI_ASSISTANT`.

Aucune route API, table Prisma, règle RBAC, logique RAG/CAG ou préférence de conversation n'est modifiée.

## Navigation mobile

`PrivateMobileChromeController` reste l'unique propriétaire de l'apparition et de la disparition des navigations privées :

- glissement du doigt vers le haut : masquage du header mobile et de la navigation basse ;
- glissement vers le bas : réapparition ;
- tap hors contrôle interactif : alternance visible/masqué ;
- focus dans un champ ou le composer : masquage temporaire afin de libérer l'espace au clavier ;
- fermeture du clavier : restauration de l'état cohérent.

Le scroll du fil ne pilote pas directement la navigation. Cela évite les oscillations et micro-saccades dues à l'inertie du navigateur.

## Clavier et safe areas

Le shell suit `window.visualViewport` pour rester compatible avec Safari iOS, Samsung Internet, PWA et navigateurs Android :

- le composer reste visible au-dessus du clavier ;
- aucun calcul n'est basé sur la hauteur animée des navigations DTSC ;
- les safe areas sont conservées pour les listes et onglets secondaires ;
- les styles du document sont restaurés au démontage du workspace ou au passage desktop.

## Desktop

Sur desktop, le workspace reste borné à la hauteur utile de l'application, sous le header global et à côté de la navigation latérale. Les listes et fils conservent leurs scrolls indépendants sans transformer l'ensemble de la page en longue colonne.

## CI/CD et QA

Le CI/CD Vercel reste inchangé :

- déploiement uniquement depuis `main` ;
- previews désactivées pour les branches de fonctionnalité ;
- `ignoreCommand` conservé ;
- aucune migration nécessaire.

`scripts/qa-assistant-ux-checks.mjs` vérifie désormais :

- le montage du shell sur les deux pages ;
- la réutilisation du viewport immersif et du contrat de gestes ;
- le scroll interne des onglets de l'assistant entreprise ;
- la compatibilité `VisualViewport` ;
- le maintien du déploiement Vercel production-only.

## Vérification manuelle

1. Ouvrir `/chat` sur mobile sans `conversationId`, sélectionner une conversation puis faire défiler un long échange.
2. Vérifier que seule la liste ou le fil défile, jamais le document complet.
3. Glisser vers le haut puis vers le bas dans une zone non interactive et vérifier le masquage/réaffichage coordonné des navigations haute et basse.
4. Ouvrir le clavier dans le composer, envoyer un message et vérifier que le composer reste visible.
5. Répéter sur `/enterprise-modules/AI_ASSISTANT` dans les onglets Chat, Sources, Historique, Usage et Paramètres.
6. Vérifier les orientations portrait/paysage, Safari iOS, Samsung Internet et PWA installée.
7. Vérifier sur desktop que le header global, la sidebar, le header conversation et le composer restent stables pendant le scroll interne.
