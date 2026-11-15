# DTSC Platform — Installation PWA depuis le site public (UX #1178)

**Statut : candidat v1.17.8, non fusionné, aucun déploiement Production.** Cette livraison rétablit la découverte de la PWA et son onboarding sur mobile/desktop. Ce n'est **pas** un package Android APK, iOS IPA, Windows EXE/MSIX ou macOS DMG et aucun lien de téléchargement de binaire n'est inventé.

## Constat initial et décision

- Les fichiers `app/manifest.webmanifest/route.ts`, `components/pwa/pwa-register.tsx` et `public/sw.js` offraient déjà la PWA sur le host APP, avec le lancement depuis `/dashboard`.
- Le composant `PublicPWAInstallCard` existait mais n'était plus utilisé par `app/page.tsx`. Son ancien bouton natif, affiché sur l'origine publique, aurait installé **le manifeste du site public** (start_url `/`), et non la PWA métier de `app.dtsc-platform.com`.
- Les PWA sont limitées à leur origine et à leur manifeste. Une page marketing ne doit pas appeler `beforeinstallprompt` pour installer un produit hébergé sur un autre sous-domaine.

## Parcours utilisateur livré

1. Depuis `https://dtsc-platform.com/`, utiliser **Installer DTSC Platform** dans le hero, le bloc dédié après le hero ou la navigation desktop/mobile.
2. Le lien mène à `https://app.dtsc-platform.com/install`, une page publique sans accès aux données privées. Si `/install` est demandé sur un autre domaine DTSC, la page serveur redirige vers l'origine APP.
3. La page détecte Android, iOS/iPadOS, Windows, macOS ou Linux ; l'utilisateur peut sélectionner manuellement une autre plateforme. Les instructions sont disponibles en **français et en anglais** suivant la langue choisie/cookie ou `Accept-Language`.
4. Lorsque le navigateur expose `beforeinstallprompt`, un bouton cliquable ouvre l'installation native sur geste utilisateur. `userChoice.accepted` signifie seulement acceptation du prompt ; l'état « installé » dépend de `appinstalled` ou du mode `standalone`.
5. Sans prompt natif, les étapes manuelles sont accessibles immédiatement : Android Chrome/Samsung Internet, iOS/iPadOS via menu de partage, Windows Chrome/Edge, macOS Chrome/Edge/Safari 17+ et Linux Chrome/Edge.
6. Après installation, l'icône DTSC Platform ouvre le tableau de bord (manifeste APP `start_url: /dashboard`), qui demande l'authentification via le host ACCOUNT si nécessaire. La page indique l'étape de connexion et la configuration facultative des notifications.

## Contrats de sécurité et vie privée

- Pas de téléchargement `.apk`, `.exe`, `.ipa` ou `.dmg`, ni de prétendue publication App Store/Play Store.
- Le produit `ACCOUNT` reste `pwa: disabled`; le produit `APP` reste `pwa: enabled`.
- La page `/install` est **publique par conception**, sans secret, aucune API financière/clinique et aucun contournement de l'authentification. Le middleware continue à protéger `/dashboard`, `/billing`, ERP et modules privés.
- Le service worker existant ne met pas en cache `/api/*`, les pages privées ni l'authentification. Le mode hors ligne sert seulement une page d'information : il n'expose pas les données des utilisateurs.
- Les données sensibles restent soumises aux droits, permissions et abonnements après l'installation. Les autorisations de notifications sont facultatives et peuvent être configurées après connexion.
- Aucun changement de schéma Prisma, migration, endpoint d'écriture, variable Vercel ou clé n'est requis.

## Matrice E2E propriétaire (à effectuer AVANT fusion)

| Environnement | Attendu |
|---|---|
| Site public desktop | Hero + bloc d'installation + navigation pointent vers le host APP, jamais vers l'installation du site vitrine |
| Chrome Android | `beforeinstallprompt` si disponible, clic bouton, `appinstalled`, icône, lancement de `/dashboard` |
| Samsung Internet Android | Guide spécifique menu Samsung, installation depuis le host APP, lancement et reconnexion |
| iPhone/iPad Safari | Pas de faux prompt natif ; Partager → Sur l'écran d'accueil → Ajouter, icône correcte |
| Chrome/Edge Windows | Install native via barre d'adresse/menu ; application accessible depuis le lanceur |
| Chrome/Edge macOS/Linux | Installation via menu/barre d'adresse, lancement sans onglet ordinaire quand supporté |
| Safari macOS 14+ | Fichier → Ajouter au Dock ; ouverture de l'application |
| Navigateur sans installabilité | Guide manuel et aucun lien mort ni téléchargement fictif |
| PWA déjà ouverte en standalone | État installé, pas de deuxième demande d'installation |
| i18n | FR/EN, sélection auto et manuelle de la plateforme, titres et étapes corrects |
| UX mobile | 320/360/375/390/414px, portrait/paysage, safe area, clavier, focus visible, cibles tactiles, aucun débordement |
| Sécurité | Accès non authentifié à `/install`, mais redirection Login avant les pages privées ; aucune donnée ERP hors ligne |
| Rejet/échec d'installation | Texte de repli et guide utilisable, pas d'état « installé » trompeur |

Les libellés de menu varient selon navigateur/version. Les commandes d'installation peuvent aussi être absentes si la PWA est déjà installée ; la page offre toujours des instructions.

## QA et livraison

- `pnpm qa:public-app-install-1178` : contrat code de routage APP vs PUBLIC, manifest, guide FR/EN, états natifs, sécurité du service worker.
- `pnpm qa:regression` ; `pnpm type-check` ; `pnpm lint` ; `pnpm build` ; Quality Gates GitHub.
- **OWNER_E2E distinct** puis autorisation de fusion ; production uniquement depuis `main` via Vercel, aucune preview ni commande manuelle.
- Version candidate **1.17.8**, commune provisoirement à la PR de sécurité PAY-4B #1177 : celle fusionnée en second devra être réconciliée sur le nouveau main, recevoir la version suivante et repasser CI/E2E.
- Retour arrière : revert de la carte, navigation, page /install et QA. Les PWA déjà installées continuent à fonctionner ; aucun schéma DB n'est modifié.

## Références techniques externes

- MDN « [Installing and uninstalling web apps](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Installing) » : installation suivant navigateur et système.
- MDN « [Trigger installation prompt](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt) » : `beforeinstallprompt` disponible essentiellement sur Chromium et dépendant de l'éligibilité.
- web.dev « [Installation](https://web.dev/learn/pwa/installation) » : étapes manuelles iOS/iPadOS et contraintes de navigateur.


## Ajout demandé : connexion ERP DTSC — Design 2.0

La même PR modernise **uniquement la présentation** de `account.dtsc-platform.com/auth/sign-in` :
- volet visuel ERP premium desktop (et rappel photo mobile) avec une photographie de tableau de bord/analytique déjà référencée par `lib/public-site.ts` : `images.unsplash.com/photo-1551288049-bebda4e38f71` (source existante Unsplash) ;
- superposition contrastée, proposition de valeur ERP, trois repères (pilotage, workflows, accès), sans simuler de vrais indicateurs client et avec texte alternatif ;
- formulaire lumineux et plus lisible, champs à bonnes tailles tactiles, assistance et langue FR/EN, espace de travail mis en évidence, contrôle du focus, mode clair/sombre.
- aucune route de login ou politique de session changée : mêmes `/api/auth/organizations`, `/api/auth/sign-in`, MFA obligatoire/récupération, redirections validées, droits et sessions. Sign-up et récupération continuent à utiliser l'ancien layout par défaut.

### QA/E2E à ajouter

- 320 / 360 / 375 / 390 / 414 / 768 / 1024 px, écran étroit clavier ouvert, défilement global correct, formulaire visible avant le visuel sur mobile.
- photo chargée avec fallback de couleur, alt descriptif, aucune donnée financière réelle exposée dans l'image illustrative, contraste et lisibilité, mode clair/sombre, FR/EN.
- connexion valide, mauvais mot de passe, liste d'espaces multiples, espace personnel, sélection obligatoire, invitation en attente, MFA TOTP/récupération, inscription et mot de passe oublié non régressés.
- authentification serveur identique, pas de session créée avant MFA.
