# AUTH-01 — Fondations TOTP (non activées)

## Limite de livraison

Cette PR ajoute une bibliothèque cryptographique, deux modèles persistants, une migration SQL additive et un service de consommation des codes à usage unique. **Elle ne modifie pas le parcours de connexion et ne propose pas encore d'écran d'inscription MFA.** Ne pas annoncer la 2FA comme disponible en Production avant la fusion et la recette AUTH-02.

## Cryptographie

- TOTP RFC 6238 : SHA-1, six chiffres, période de trente secondes, tolérance maximale ± un pas.
- Anti-rejeu : le pas accepté est persisté atomiquement avec un prédicat de croissance (UPDATE conditionnel). La fonction de vérification seule n'est pas une garantie anti-rejeu.
- Secrets : vingt octets aléatoires Base32 ; chiffrement AES-256-GCM avec nonce aléatoire et clé de 32 octets.
- Codes de secours : dix valeurs aléatoires indépendantes de 96 bits, stockées uniquement sous SHA-256, consommation atomique et unique.
- Le QR de l'authentificateur sera rendu localement depuis l'URI otpauth, jamais via un fournisseur QR externe.
- Les clés, URI otpauth, secrets déchiffrés et codes de secours en clair ne vont jamais dans les journaux, métadonnées d'audit ni captures.

## Configuration avant activation AUTH-02

Ajouter une variable de secret Vercel Production nommée AUTH_TOTP_ENCRYPTION_KEY. Sa valeur doit contenir 32 octets cryptographiquement aléatoires encodés en base64url, sans publication ni copie dans GitHub. Prévoir une sauvegarde sécurisée et une stratégie de rotation/réchiffrement versionné avant l'activation.

La présence de la variable n'est pas nécessaire aux parcours d'authentification existants : les nouveaux services ne sont pas appelés tant qu'AUTH-02 n'intègre pas le nouveau parcours.

## Rollback

Migration additive 20261102142000_auth_totp_foundation ; aucune modification des mots de passe et des sessions existants, aucun backfill. Revenir sur le code par une PR de rollback si nécessaire. Ne pas supprimer les tables contenant les futures données MFA. Vérifier l'application des migrations sur une base vide dans la Quality Gate.

## Poursuite

- AUTH-02 : activation avec réauthentification, QR/clé manuelle, récupération, challenge pré-session, quotas, alertes, conservation de la redirection sûre, UI Design 2.0.
- AUTH-03 : registre de sessions et révocation, politiques Console DTSC et entreprise.
- AUTH-04 : step-up, appareil fiable et alertes de connexions.
- README : seulement après livraison réelle des modules concernés, selon #1012.

## Validation

Lancer node scripts/qa-auth-totp-foundation.mjs, pnpm prisma generate, pnpm type-check, pnpm lint, pnpm qa:regression et pnpm build, puis les QA migrations et la recette E2E propriétaire. La simple présence de fichiers n'établit pas que ces vérifications ont été exécutées.
