# Hotfix P0 #1026 — boucle Chrome mobile Console ↔ Account après MFA

**Date :** 2026-11-03

**Issue :** [#1026](https://github.com/Bandsman942/dtsc-platform/issues/1026)

**Livraison :** branche `fix/1026-chrome-mfa-session-redirect-loop`, sans Preview ; `OWNER_E2E #1026 NOT_EXECUTED`. La fusion dans `main` et la Production sont interdites tant que CI et propriétaire n'ont pas validé.

## Diagnostic et frontière de confiance

Le middleware Edge vérifie la signature et la date du cookie `dtsc_session`. Ce cookie peut cependant rester cryptographiquement valide après révocation de la session PostgreSQL, suspension, changement de politique MFA ou invalidation de la session par le serveur. `getSession()` est l'autorité plus complète.

Avant ce hotfix, une demande Console `/admin` avec cookie signé mais session serveur révoquée pouvait être renvoyée à Account `/auth/sign-in` par `requireUser()`, puis automatiquement redirigée à Console par le middleware à cause du seul attribut signé `mfaVerifiedAt`. Ce circuit tourne en boucle et ressemble à un rechargement permanent, particulièrement visible sous Chrome mobile. Le déclenchement exact chez le propriétaire nécessite une trace navigateur : le chemin source est confirmé, la causalité en Production reste à certifier.

## Correction ciblée

1. Sur Account `/auth/sign-in` et `/auth/sign-up`, le middleware ne renvoie plus un visiteur vers un autre produit à partir des seules claims du cookie. Les pages valident la session via `getSession()` avant toute redirection post-login.
2. Le contrat antérieur demeure : une session active avec MFA validée peut accéder directement au bon contexte, les paramètres `next` sont traités par le résolveur existant ; `reason=session-expired` maintient le formulaire de reconnexion.
3. `GET /api/auth/heartbeat` fournit une réponse minimale `200` ou `401` et `Cache-Control: no-store`, sans mutation ni renouvellement de cookie. Un message `logout` d'un autre onglet ne provoque un changement de page que si cette vérification côté serveur confirme la révocation (`401`). Les erreurs réseau/5xx n'entraînent pas de navigation compulsive. Les messages sont regroupés pendant une vérification en cours.
4. Aucun contournement de MFA, de permissions, de registre de sessions, de contexte DTSC ou de règles multi-tenant. Aucune migration ni variable nouvelle. Le support PWA/Service Worker de #1023 reste indépendant.

## Vérification automatisée

- `node scripts/qa-hotfix-1026-chrome-mfa-session-loop.mjs` : comportement réel des routes Account, middleware, vérification 200/401 et réactions aux erreurs réseau.
- `node scripts/qa-hotfix-1022-console-auto-reload.mjs` : non-régression de la correction précédente.
- Le nouveau script est appelé par `qa-session-background-push-checks` puis par `qa:regression`.
- CI : `type-check`, lint, QA ciblée et régression, build selon le pipeline du dépôt. Le résultat final est documenté dans la PR.

## Recette OWNER_E2E #1026 — Chrome Android (obligatoire)

À exécuter sur la version du hotfix prévue pour validation, dans un environnement contrôlé. Ne jamais partager de TOTP, cookie, jeton ou secret dans les preuves.

1. **Cookie signé / session révoquée :** connexion MFA valide dans Chrome, puis révocation de cet appareil depuis une autre session ; ouvrir `/admin` dans l'onglet révoqué. Attendu : retour unique à Account, formulaire stable pendant 2 minutes, aucun rebond vers Console.
2. **Session active :** connexion MFA valide, visite manuelle de `/auth/sign-in?next=%2Fadmin`. Attendu : une seule redirection vers Console, navigation normale et droits serveur inchangés.
3. **Expiration explicite :** visite de `/auth/sign-in?reason=session-expired` avec cookie historique. Attendu : formulaire de reconnexion affiché, pas de redirection automatique.
4. **Onglets multiples :** ouvrir deux onglets Console, déconnecter l'un, se reconnecter dans l'autre et provoquer un ancien message de synchronisation. Attendu : une nouvelle session valide n'est pas déconnectée ; une session effectivement révoquée reste refusée.
5. **Réseau fluctuant :** Chrome mobile, Wi-Fi↔4G et arrière-plan↔premier plan ; ouvrir formulaire, taper du texte, naviguer dans plusieurs modules pendant 5 minutes. Attendu : aucun reload non sollicité, aucun texte perdu, erreurs réseau non transformées en redirections MFA.
6. **Contexte et isolation :** tester App, Support, Console, rôle non interne, MFA incomplet, et `next` externe malveillant. Attendu : redirections légitimes uniquement, pas de privilège supplémentaire ni d'open redirect.
7. **Comparaison :** répéter la recette sur Chrome normal et navigation privée, puis sur un autre navigateur Android. Ne pas confondre chargement d'une nouvelle page, refresh RSC et rechargement document complet.

Pour chaque parcours : statut PASS/FAIL, horodatage, appareil/version Chrome, URL avant/après (sans paramètres sensibles), éventuels codes HTTP et diagnostics sans données personnelles. **L'E2E #1023 BON ne vaut pas approbation de #1026.**

## Rollback

Si une régression critique apparaît après une future livraison, restaurer par un revert Git ciblé du commit #1026 sur `main`, passer les vérifications et déployer uniquement via la pipeline Production habituelle. Ne pas restaurer de cookie révoqué et ne pas désactiver les contrôles MFA.
