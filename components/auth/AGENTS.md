# Règles locales — composants d'authentification

- Les timers navigateur ne sont jamais la source de vérité après suspension, veille ou reprise mobile : revalider la session côté serveur avant de conclure à une expiration.
- Une activité utilisateur peut actualiser un timestamp local, mais les heartbeats réseau doivent rester throttlées.
- Synchroniser activité, renouvellement et logout entre onglets de même origine via mécanismes navigateur standards avec fallback raisonnable.
- Le bouton « Rester connecté » doit renouveler réellement token/cookie côté serveur ; ne jamais se limiter à repousser un timer React.
- Préserver le comportement `/session-expired`, les safe areas, les dialogs scrollables et les corrections iOS/PWA du Sprint 1.
