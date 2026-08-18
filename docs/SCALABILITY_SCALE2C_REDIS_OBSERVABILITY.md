# SCALE-2C — Observabilité Redis Production et clôture SCALE-2

Issue : #425  
Parent : #355  
Programme : #352

## Objectif

SCALE-2C ferme la boucle ouverte par SCALE-2A et SCALE-2B : les états éphémères de présence et l’inbox globale des événements d’appel sont Redis-first, et leur gain doit être visible sans recréer une pression PostgreSQL par la télémétrie elle-même.

## Dernière dette découverte

Après SCALE-2A/B, les chemins métier Redis-only avaient bien supprimé l’essentiel des lectures/écritures PostgreSQL, mais leurs routes HTTP appelaient encore `writeApiLog()` à chaque succès. Or `writeApiLog()` persiste une ligne `ApiLog` dans PostgreSQL.

Conséquence :

- chaque heartbeat présence continuait à produire une écriture PostgreSQL ;
- chaque poll global d’événements d’appel continuait à produire une écriture PostgreSQL, même sans réconciliation DB.

SCALE-2C supprime cette écriture systématique.

## Budget d’écriture après SCALE-2C

### Présence

Un heartbeat normal avec lease Redis valide :

- rafraîchit Redis ;
- incrémente le compteur Redis dans le même pipeline ;
- n’écrit pas `ApiLog` ;
- n’écrit PostgreSQL que lorsque le checkpoint durable de 180 s est dû ou lorsque Redis bascule en fallback.

Les refus d’origine, erreurs d’authentification, rate limits, payloads invalides et mises hors ligne explicites restent journalisés.

### Événements d’appel

Un poll normal Redis-only :

- lit l’inbox Redis ;
- incrémente le compteur Redis dans le même pipeline ;
- n’écrit pas `ApiLog` ;
- n’interroge PostgreSQL que lorsque la réconciliation bornée est due, que Redis est indisponible ou que les préférences doivent être rechargées depuis la DB.

Les réconciliations et fallbacks restent journalisés afin de mesurer le chemin DB réel.

## Télémétrie Redis

`lib/scalability/redis-observability.ts` utilise des buckets horaires anonymes :

```text
dtsc:scalability:redis:<hour-bucket>
```

Aucun `userId`, `groupId`, tenant, contenu métier ou secret n’est inclus dans la clé ou dans les champs.

Les buckets utilisent :

- `HINCRBY` pour les compteurs ;
- `EXPIRE` avec une rétention de 8 jours ;
- `PING` pour le probe live ;
- `HGETALL` pour le résumé 1 h / 24 h / 7 j.

La granularité des compteurs est explicitement de 60 minutes. Ce n’est pas une mesure à la seconde ni une certification de charge.

## Métriques exposées

Présence :

- heartbeats Redis ;
- lectures Redis ;
- checkpoints PostgreSQL ;
- fallbacks PostgreSQL ;
- ratio Redis-first.

Appels :

- lectures inbox Redis ;
- publications Redis ;
- réconciliations PostgreSQL ;
- fallbacks PostgreSQL ;
- chargements des préférences depuis PostgreSQL ;
- ratio Redis-first ;
- part des polls nécessitant une lecture DB.

Le dashboard Console → CTO → Scalabilité affiche aussi la latence du probe Redis et l’état `OK`, `DEGRADED`, `UNAVAILABLE` ou `UNCONFIGURED`.

## Source durable et sécurité

Redis reste une couche éphémère. PostgreSQL reste la source durable pour :

- `CollaborationPresenceSession` ;
- `CollaborationGroupCallEvent` ;
- préférences utilisateur ;
- audit utile de sécurité, fallback et réconciliation.

Les contrôles de tenant, membership, entitlement et RBAC restent exécutés sur les chemins qui lisent la source durable. La télémétrie Redis ne contient aucune donnée permettant d’élargir un scope d’accès.

## Notifications générales

Le diagnostic SCALE-2C confirme que `PwaNotificationBridge` privilégie Web Push. Si une subscription Push active existe, aucun fallback foreground n’est exécuté. Sans subscription Push, `/api/notifications/foreground` est appelé au montage ; aucun `setInterval` de polling général n’est introduit.

Aucune refonte artificielle de Web Push n’est donc nécessaire dans SCALE-2.

## Preuve Production attendue

Après merge sur `main` uniquement :

1. vérifier Vercel Production `READY` sur le SHA de merge ;
2. ouvrir Console → CTO → Scalabilité ;
3. vérifier que Redis n’est plus `NOT_MEASURED` ;
4. constater des compteurs Redis réels après trafic de présence/appels ;
5. comparer les hits Redis aux checkpoints/réconciliations/fallbacks DB ;
6. joindre les valeurs observées à #355 ;
7. fermer #355 uniquement si le chemin Redis-first domine et qu’aucune régression sécurité/durabilité n’est constatée.

SCALE-7 reste responsable de la certification 500 → 1 000 → 2 500 → 5 000 utilisateurs simultanés.
