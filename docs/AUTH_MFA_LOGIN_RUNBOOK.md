# AUTH-02 — Authentification TOTP dans DTSC Platform

**État : implémentation sur branche de développement, activation Production non validée.**

## Périmètre effectif de la PR

La connexion par mot de passe reste la première étape. Si un TOTP est activé sur le compte global, la route de connexion produit un challenge **pré-session** stocké côté serveur. Elle supprime le cookie de session existant et ne peut pas délivrer de nouvelle session complète avant vérification d'un code TOTP ou de récupération.

Le challenge est limité à cinq minutes, six tentatives atomiques et un seul usage. Le jeton de challenge est aléatoire (32 octets), stocké uniquement sous SHA-256 et transmis par cookie HTTP-only, host-only, SameSite Strict. Il n'est ni un cookie SSO ni une autorisation d'API privée.

À la validation, le backend recontrôle l'état du compte et, pour un espace entreprise, le membership actif avant de créer une session partagée `dtsc_session`. La redirection est bornée à la liste interne autorisée.

## Activation utilisateur

1. Accéder à Paramètres → Authentification à deux facteurs.
2. Confirmer le mot de passe.
3. Scanner le QR avec une application d'authentification ou saisir la clé Base32 manuellement. Le QR est rendu **localement** dans le navigateur, jamais transmis à un service distant.
4. Saisir le code de six chiffres et confirmer.
5. Sauvegarder hors de l'appareil les dix codes de récupération de 96 bits. Ils ne sont présentés qu'une seule fois et leur condensat est persisté.
6. Se reconnecter, puis tester le second facteur et un code de récupération dans un environnement de recette.

La désactivation demande le mot de passe actuel **et** un code TOTP ou de récupération valide. Les changements sont journalisés sans secrets.

## Composant QR sous licence

`lib/vendor/qrcodegen.ts` est une copie de la bibliothèque Project Nayuki (licence MIT), avec notice de copyright/licence conservée dans le fichier. La génération fonctionne hors réseau externe.

## Clé cryptographique : prérequis bloquant

Configurer `AUTH_TOTP_ENCRYPTION_KEY` en environnement Vercel Production : 32 octets cryptographiquement aléatoires, base64url, jamais dans Git. Tester restauration et rotation/réchiffrement. Un secret manquant provoque l'échec de l'enrôlement ou de la vérification ; **ne pas désactiver le contrôle MFA comme fallback**.

## Limitations explicitement suivies

- Les sessions déjà délivrées avant l'activation TOTP restent valides jusqu'à expiration tant que le registre/révocation #1010 n'est pas livré. Ne pas rendre le MFA globalement obligatoire avant ce chantier.
- Les politiques différenciées par rôle/tenant et la console d'administration seront livrées par #1010.
- Les alertes, appareils fiables, réauthentification de toutes les mutations sensibles et récupération administrateur contrôlée restent #1011.
- Un nettoyage périodique des challenges expirés et une rotation versionnée des clés doivent être validés avec les mécanismes de sessions/politiques du #1010.
- Le README sera réécrit à partir de l'application **effectivement livrée** (#1012), et non des fonctionnalités anticipées.

## Scénarios OWNER_E2E obligatoires

| Cas | Résultat attendu |
| --- | --- |
| Compte historique sans TOTP | Connexion et navigation inchangées |
| TOTP initial | Mot de passe → QR → code valide → codes de récupération |
| Challenge à la connexion | Pas d'accès App/Console/Support avant code valide |
| Code erroné ou expiré | Erreur lisible, pas de session authentifiée |
| Code rejoué | Rejet strict |
| Code de secours | Succès une fois seulement, rejet au second usage |
| Tentatives excessives | Verrouillage et nouvelle connexion nécessaires |
| Expiration cinq minutes | Challenge invalide, aucune connexion |
| Sélection d'espace | Membership revalidé, redirection interne sûre |
| Désactivation | Mot de passe et second facteur requis |
| Clé de chiffrement absente | Échec fermé, aucun contournement MFA |
| Mobile | 320, 360, 375, 390, 414 px, PWA/iOS, QR, clé manuelle, safe-area |
| A11y et langues | FR/EN, clavier, contraste, mode clair/sombre |

### Preuves de livraison

L'existence du script `qa-auth-mfa-journey` ne prouve pas un E2E. Vérifier le résultat CI, exécuter un parcours réel authentifié et faire confirmer par le propriétaire avant fusion. Déploiement Vercel uniquement depuis `main` ; aucun Preview.

## Rollback

Préserver les tables et secrets existants. Avant tout rollback d'une version activée en Production, définir et documenter un mécanisme de continuité **sans bypass MFA** ; un simple retrait du challenge sans désactivation coordonnée de l'ensemble de la politique n'est pas un rollback sûr.
