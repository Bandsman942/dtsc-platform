# Règles locales — `lib/`

Ces règles complètent `../AGENTS.md` pour l'authentification, les sessions et les notifications Push.

- Les durées de session sont contrôlées côté serveur. Ne jamais accepter une durée arbitraire envoyée par le client ni réintroduire une constante globale unique pour tous les utilisateurs.
- Une session glissante doit rester bornée par une durée absolue liée à l'authentification initiale. Un heartbeat, un changement de contexte ou un Web Push ne doit jamais réinitialiser cette durée absolue.
- Ne jamais utiliser polling caché, heartbeat permanent, Service Worker ou connexion LiveKit comme mécanisme pour maintenir artificiellement une session ou un processus web en arrière-plan.
- Web Push et authentification sont indépendants : recevoir un push ne renouvelle jamais une session et cliquer une notification ne contourne jamais les contrôles d'accès.
- Les payloads Push doivent rester minimaux et neutres par défaut. Ne jamais exposer automatiquement de données médicales, pharmaceutiques, RH, financières, juridiques ou autres informations sensibles sur l'écran verrouillé.
- Toute URL provenant d'un payload Push doit être normalisée vers une route interne DTSC et ne doit jamais devenir un open redirect.
- La clé VAPID privée reste strictement serveur et ne doit jamais utiliser un préfixe `NEXT_PUBLIC_`.
- Un échec Web Push est secondaire : il ne doit jamais rollback une transaction métier ou la création de la `Notification` persistée.
