# Changelog addendum — Sessions configurables & Web Push

Date: 28 juillet 2026

## Ajouté

- Politique de session utilisateur configurable : 15 min, 30 min, 1 h, 4 h, 8 h, 24 h, 7 j ou 30 j.
- Valeur par défaut 30 minutes d'inactivité.
- Durée absolue maximale d'authentification : 30 jours.
- Token signé enrichi avec `authTime`, `issuedAt`, `idleTimeoutMinutes`, `absoluteExp` et `exp`.
- Modèle Prisma multi-fichiers `UserSessionPreference` et migration dédiée.
- Heartbeat serveur contrôlé, audité indirectement via API logs, avec vérification utilisateur ACTIVE.
- Synchronisation multi-onglets via BroadcastChannel + fallback storage.
- Recalcul session après sleep/resume mobile.
- Écran Paramètres « Sécurité et session ».
- Véritable Web Push : VAPID, chiffrement RFC 8291, abonnement PushManager, dispatcher central, événements Service Worker `push`/`notificationclick`.
- Payloads Push minimisés pour protéger données Santé, Pharmacie, RH, Finance et Juridique.
- Nettoyage des subscriptions 404/410.
- Logout manuel : révocation de l'abonnement Push du terminal courant.
- Reconciliation foreground et Badging API progressive.
- QA source-level `qa:session-push` et matrice `docs/QA_SESSION_BACKGROUND_PUSH.md`.

## Modifié

- `notifyUser` / `notifyUsers` déclenchent le dispatcher Push après persistance DB.
- Les routes Activités principales utilisent le service notification central au lieu de créations Prisma directes.
- `PwaNotificationBridge` devient fallback foreground afin d'éviter les doublons avec le vrai Push.
- Service Worker cache v8, sans élargir le cache aux routes privées.
- Les préférences générales n'activent/désactivent plus le Web Push : l'abonnement réel du terminal devient l'autorité UX.

## Sécurité

- Durées de session validées côté serveur et en base.
- Heartbeat ≠ Web Push ; un push ne renouvelle jamais une session.
- Endpoints Push : same-origin sur mutations, rate limit, ownership, HTTPS et refus d'hôtes locaux directs.
- VAPID private key strictement serveur.
- `notificationclick` n'accepte que les routes internes DTSC.
- Aucun contenu métier complet n'est placé automatiquement sur l'écran verrouillé.
