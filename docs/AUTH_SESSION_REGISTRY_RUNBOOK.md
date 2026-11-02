# AUTH-03 — Registre des sessions DTSC

Statut : **implémentation initiale en branche**, non livrée en Production.

## Source de vérité

`AuthSession` (Prisma/PostgreSQL) est l'autorité de révocation des nouvelles sessions. La session signée `dtsc_session` conserve le `sessionId` stable ; elle ne remplace pas le contrôle serveur.

- Toute nouvelle connexion enregistre une session avant émission du cookie.
- `getSession()` contrôle signature, expiration du cookie et statut de la session en base. Une session révoquée échoue fermée.
- Changement d'espace, renouvellement de session et heartbeat conservent le `sessionId` ; le middleware conserve l'identifiant dans la signature renouvelée.
- Déconnexion : la session correspondante est révoquée côté serveur, puis le cookie est effacé.
- `getCurrentUser(sessionOverride)` revalide toujours le cookie courant via `getSession()` : un snapshot de session transmis par un appelant ne constitue jamais un contournement de la révocation ; une identité discordante est refusée.
- `getSession()` vérifie désormais aussi l'état `ACTIVE` du compte et, pour un contexte lié à une organisation, que le membership de l'utilisateur et l'organisation restent actifs. Le retrait d'un utilisateur ne doit pas laisser son ancien cookie exploitable.
- Console DTSC → Audit de sécurité : inventaire paginé des sessions actives et recherche par nom/email (`SECURITY_READ`). Une révocation exige `SECURITY_MANAGE`, le mot de passe actuel de l'opérateur, un motif détaillé et une trace d'audit. Les sessions des clients restent hors de portée des administrateurs de leurs entreprises, sauf permissions globales internes DTSC explicites.
- QA comportementale complémentaire `pnpm qa:auth-session-registry-behavior` exécutant réellement le service avec une base Prisma simulée : isolation utilisateurs, expiration, révocation, invalidation legacy, signature et continuité du cookie, suspension du compte et retrait de membership.

- `/api/account/security/sessions` : liste paginée des appareils actifs, déconnexion d'une session ou de toutes les autres sessions, portée à `session.userId`, même origine, limitation des tentatives, audit.
- Interface dans Paramètres : états, recherche parmi les sessions chargées, confirmations destructrices, FR/EN, responsive.

## Migration et compatibilité

Migration additive `20261102183000_auth_sessions_registry` : table `AuthSession` et colonne `UserSessionPreference.legacySessionsInvalidBefore`.

Les anciens cookies signés dépourvus de `sessionId` restent compatibles jusqu'à leur expiration absolue, mais sont rejetés après une invalidation explicite des anciennes sessions. Un heartbeat ou changement d'espace les enregistre dans le registre. Cela évite une déconnexion massive pendant le déploiement.

**Important :** sans `sessionId`, une session historique ne peut pas être déconnectée individuellement. Le bouton « Déconnecter les autres appareils » invalide les anciens cookies grâce à `legacySessionsInvalidBefore`, et révoque les autres sessions répertoriées.

## Limites connues / suite de l'Issue #1010

Ce delta ne couvre pas encore les politiques MFA globales/tenant ni leur administration dans la Console ; il s'agit du socle du hotfix #1010. Les règles de MFA seront intégrées après stabilisation de #1009.

Le middleware Edge ne consulte pas PostgreSQL : sa vérification locale sert au routage et au renouvellement, **pas** à l'autorisation métier. Les pages et API doivent toujours confirmer les droits via `getSession()`, `requireUser()` ou leur garde serveur de domaine. Un audit spécifique doit s'assurer qu'aucune route ne se contente du middleware pour autoriser les mutations. La révocation immédiate est effective au niveau de `getSession()` mais doit être certifiée par des scénarios de bout en bout sur tous les sous-domaines avant de déclarer la totalité du contrat satisfaite.

La vérification des anciennes sessions après activation TOTP nécessite l'intégration AUTH-02→AUTH-03 (ne pas déclarer une politique MFA obligatoire avant cet audit). Les anciennes sessions authentifiées avant l'activation du TOTP ne doivent pas rester un moyen de contourner le MFA.

## Test OWNER_E2E

1. Connecter compte X sur deux navigateurs. Vérifier deux lignes distinctes.
2. Déconnecter navigateur B depuis A ; B doit recevoir 401 sur toutes les API protégées, y compris App/Console/Support, et ne plus accéder aux données.
3. « Déconnecter les autres appareils » : A reste actif, B est révoqué. Après reconnexion, B est à nouveau actif.
4. Vérifier changement de tenant/organisation et heartbeat sans créer de nouvelles sessions fantômes.
5. Sur un navigateur avant migration, vérifier compatibilité puis révocation globale.
6. Refaire sur 320/360/375/390/414/768/1024/1440px en FR/EN, clair/sombre, clavier.
7. Simuler PostgreSQL indisponible : l'authentification serveur échoue fermée ; aucun basculement permissif.

## Rollback

Préserver table et historique des révocations pour permettre une restauration sans résurrection d'une session révoquée. Aucun déploiement de branche/Preview. Fusion de main et release uniquement après CI, sécurité et OWNER_E2E.
