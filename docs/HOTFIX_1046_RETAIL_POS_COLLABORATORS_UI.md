# Hotfix #1046 — POS cartes & conversations immersives 2.0

Date : 8 novembre 2026. Statut : **candidat en branche**, sans déploiement, en attente de CI et validation E2E du propriétaire.

## Portée

- **POS** : entrée `/enterprise-modules/RETAIL_POS` devenue un répertoire de **14 petites cartes tactiles** : 13 sections `?section=...` et un accès à la route commerciale dédiée. Chaque carte mène à une vue distincte avec retour explicite vers le répertoire. Aucun panneau client, financier, de boutique ou d'équipement n'est monté avant ouverture de sa carte.
- **Autorisations** : `sites`, `staff` et `activation` restent filtrés par le rôle propriétaire/administrateur d'entreprise côté serveur ; les API gardent leurs vérifications d'accès existantes. Tout identifiant de section inconnu/interdit donne 404.
- **Liens profonds** : les routes de prérequis d'activation et de préparation Retail visent directement `?section=readiness`, `?section=staff` et `?section=activation` avec leurs ancres préexistantes.
- **Client au comptoir** : surface DTSC 2.0 (tokens de thème, carte claire, hiérarchie typographique, boutons tactiles, grille de recherche mobile); conservation de la sélection, recherche, création, fidélité, avoirs et historique.
- **Tarification, offres & retours** : l'écran existant `/enterprise-modules/RETAIL_POS/commercial` est accessible comme 14e carte et retrouve `AppShell` (barre DTSC et navigation), un retour unique compact, des onglets identifiés et les cartes, champs, contrastes et états de focus du thème DTSC 2.0 en clair/sombre. Les règles de tarification, les promotions, les demandes et décisions de retour, ainsi que tous leurs droits et appels API sont conservés.
- **Mes collaborateurs** : la barre de retour générique sort du layout conversationnel plein écran. Un retour compact mène au module précédent depuis la liste ; le retour interne du fil mène à la liste. La zone de saisie demeure ancrée en bas et le hub flottant est dissimulé **uniquement pendant la conversation immersive mobile**, pour ne pas recouvrir la saisie. L'ajout de contact reste accessible depuis le rail des contacts ; groupes, appels, contenus, accusés et menus demeurent inchangés.
- Aucun changement de schéma, API métier, session, abonnement ou activation de feature flag.

## Contrats QA

Automatique : `node scripts/qa-hotfix-1046-retail-collaboration-ui.mjs`, `pnpm qa:responsive-ui`, `pnpm qa:standard-experience`, `pnpm qa:regression`, `pnpm type-check`, `pnpm lint`, `pnpm build`. Contrôle requis à 320, 360, 375, 390, 414, 768, 1024 px, thème clair/sombre, FR/EN.

## Recette propriétaire E2E (à signer)

1. Avec un **caissier** : ouvrir POS et consulter les cartes (sans cartes administratives), entrer dans **Vente comptoir**, revenir, sélectionner un client, revenir et encaisser normalement. Le client sélectionné doit être repris par la vente et les droits de caisse conservés.
2. Avec un **propriétaire/admin** : ouvrir **Pilotage des boutiques**, **Accès des collaborateurs**, **Mise en service** et **Activation avancée** ; ouvrir leurs prérequis par liens et vérifier la bonne page/section, sans activer de flag par accident.
3. Ouvrir la carte **Tarification, offres et retours** depuis le POS : vérifier le thème DTSC, le retour au répertoire, les trois onglets, les listes, formulaires et permissions, en clair/sombre et FR/EN. Tester avec un rôle non autorisé : aucune action de modification ne doit lui être accordée.
4. À 320–414 px : vérifier la grille client, les formulaires nouveau client, le clavier, la gestion des avoirs, et l'absence de défilement horizontal.
5. Dans **Mes collaborateurs** : vérifier la liste sans barre de retour supérieure, utiliser le retour discret, ouvrir un groupe et revenir à la liste ; contrôler les messages, pièces jointes, vocaux, appels audio/vidéo, recherche et menus.
6. Sur **Android Chrome** et **iOS/PWA** : ouvrir le clavier, rédiger un long message, faire défiler le fil, vérifier que le compositeur n'est jamais caché ou couvert par un bouton flottant, et que la navigation native du navigateur reste fonctionnelle.

**Garde-fou de livraison :** n'effectuer aucune fusion ou publication Production avant `E2E #1046 BON` explicite du propriétaire et la réussite des Quality Gates. Les previews Vercel restent désactivées.
