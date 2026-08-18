# SCALE-3B — Politique de dégradation du rate limiting et télémétrie bornée

Issue: #430  
Parent: #356  
Programme: #352

## Objectif

SCALE-3A a rendu le primitive distribué atomique, anonymisé et borné en latence. SCALE-3B rend maintenant le comportement de panne **explicite par famille de risque** et observable sans dépendre de Redis.

Aucune limite numérique métier n'est modifiée. Redis reste la protection distribuée normale. Cette itération ne change que la décision prise lorsque Redis est indisponible, timeout ou renvoie un résultat inexploitable.

## Registre central

`lib/rate-limit-policy.ts` est la source de vérité de la politique de panne.

| Profil | Mode de panne | Usage |
|---|---|---|
| `security-critical` | `closed` | authentification, récupération de compte, identité, OAuth, paiement, mutations publiques sensibles et confirmations d'outils |
| `cost-critical` | `closed` | Chat/IA, agents, IA entreprise/collaboration, agent public et appels MCP |
| `availability-balanced` | `local` | valeur par défaut pour les parcours non classés : protection bornée par instance pendant la panne |
| `availability-first` | `open` | profil disponible mais **aucune règle active dans SCALE-3B** |

Une option `failureMode` passée explicitement au primitive reste compatible et devient `explicit-override`. Le registre est toutefois la voie canonique pour les familles communes afin d'éviter des choix dispersés dans les handlers.

## Règles sensibles classées

### Security critical — fail closed

Les préfixes suivants ont été vérifiés contre les appelants actuels :

- `auth:sign-in:` ;
- `auth:sign-up:` ;
- `auth:forgot-password:` ;
- `auth:reset-password:` ;
- `enterprise-identity-` ;
- `mcp-oauth-` ;
- `billing-checkout:` ;
- `public:contact:` ;
- `public:newsletter:` ;
- `ai-tool-confirm:` ;
- `ai-tool-cancel:`.

Le fail-closed signifie qu'une panne Redis ne permet pas de contourner la protection. Les routes gardent leur réponse HTTP existante. En particulier, la récupération de mot de passe conserve sa réponse générique 202 lorsqu'elle est limitée afin de ne pas créer de canal d'énumération de comptes.

### Cost critical — fail closed

Préfixes vérifiés :

- `chat:` ;
- `chat-v2:` ;
- `chat-agent:` ;
- `public:dtsc-agent:` ;
- `enterprise-ai-chat:` ;
- `enterprise-ai-agent:` ;
- `collaborators-ai-compose:` ;
- `collaborators-agent:` ;
- `ai-mcp:`.

Ces chemins peuvent déclencher des appels modèle, agent ou MCP. Pendant une panne Redis, le rate limiter ne doit pas devenir un bypass de coût. Les quotas d'abonnement et quotas IA canoniques restent inchangés et continuent de s'appliquer en plus de ce contrôle.

## Pourquoi le défaut reste `availability-balanced`

Le repository comporte de nombreuses routes CRUD ou interactives déjà protégées par session, same-origin, RBAC, validation et/ou permissions métier. Les fermer toutes lorsque Redis est indisponible transformerait un incident de cache/quota en panne générale de DTSC Platform.

Un scope non classé utilise donc le fallback local borné de SCALE-3A :

- le résultat reste `degraded=true` ;
- la source est `local` ;
- la protection n'est pas présentée comme globale ;
- chaque instance conserve au maximum 10 000 buckets locaux ;
- la preuve multi-instance reste requise dans #356.

## Aucun fail-open silencieux

`availability-first` existe comme primitive de gouvernance mais aucune règle SCALE-3B ne l'active. Une future activation doit avoir une justification métier et une QA explicite. Le registre ne fait pas de classification heuristique sur des mots comme `ai`, `admin` ou `public` : seules des règles de préfixes documentées sont utilisées.

## Télémétrie pendant une panne Redis

Les compteurs Redis de SCALE-2 sont adaptés lorsque Redis fonctionne, mais ne peuvent pas être l'unique mécanisme pour mesurer une panne de Redis. Écrire un `ApiLog` PostgreSQL à chaque fallback ferait en plus porter la charge de l'incident à la base relationnelle.

`lib/scalability/rate-limit-fallback-observability.ts` applique donc une télémétrie runtime bornée par instance :

- premier événement dégradé d'un bucket émis immédiatement ;
- événements suivants agrégés ;
- au plus une émission agrégée par minute et par combinaison `profile/failureMode/source/reason` ;
- maximum 64 buckets en mémoire ;
- éviction du bucket le moins récemment vu lorsque la borne est atteinte ;
- aucun accès Redis ;
- aucune écriture PostgreSQL ;
- aucune clé logique de rate-limit ;
- aucun IP, userId, organizationId ou tenantId ;
- aucun objet erreur/provider brut.

Format de l'événement structuré :

```json
{
  "event": "dtsc.rate_limit.degraded",
  "profile": "cost-critical",
  "failureMode": "closed",
  "source": "fail-closed",
  "reason": "TIMEOUT",
  "count": 12,
  "aggregationWindowMs": 60000
}
```

`reason` reste le code normalisé du helper Redis (`UNCONFIGURED`, `TIMEOUT`, `ERROR`, etc.), pas le message d'un provider.

## Données, RBAC et sécurité

- aucune migration Prisma ;
- aucun backfill ;
- aucune nouvelle donnée durable ;
- aucune modification de session, RBAC, entitlement ou isolation tenant ;
- les clés Redis restent SHA-256 sous `dtsc:rl:v2:*` ;
- la classification se fait sur la clé logique avant son hash, mais cette clé n'est jamais transmise à la télémétrie ;
- les secrets Upstash restent serveur-only via `lib/redis-rest.ts`.

## QA

`scripts/qa-scale3b-rate-limit-policy-telemetry.mjs` vérifie notamment :

- l'existence des quatre profils et leur mode ;
- l'absence de règle `availability-first` active ;
- les préfixes security/cost-critical ;
- leur correspondance avec des scopes réellement présents dans les routes ;
- l'utilisation du registre par `lib/rate-limit.ts` ;
- la classification avant anonymisation ;
- le maintien du hash `dtsc:rl:v2` ;
- les bornes de télémétrie ;
- l'absence de PostgreSQL, de commandes Redis et d'identités brutes dans le collecteur de fallback.

Cette QA est branchée dans `scripts/run-regression-qa-ci.mjs`.

## Rollback

Revert applicatif normal. Aucun stockage durable n'est à restaurer. Le retour à SCALE-3A rétablit le comportement `local` par défaut du primitive.

## Scope restant avant fermeture de SCALE-3

#356 reste ouvert après SCALE-3B. Il exige encore une preuve réelle de comportement :

1. concurrence multi-instance ;
2. coupure/timeout Redis contrôlé ;
3. vérification des profils `closed` et `local` sous failover ;
4. mesure de latence pour confirmer l'absence d'attente Redis longue ;
5. charge/failover documentée avec critères PASS/FAIL.

Aucun de ces éléments n'est considéré comme prouvé par la QA statique de SCALE-3B.
