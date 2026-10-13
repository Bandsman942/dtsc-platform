# Supervision RAG/CAG et signaux de sécurité IA — AI-CONSOLE-04

Le Centre IA `/admin/ai-control-center` affiche uniquement des agrégats de métadonnées sous la permission `CONSOLE_AI_READ` et le contexte `DTSC_INTERNAL`, sans aucune donnée privée d'entreprise ou de personne.

## Sources canoniques

- `KnowledgeDocument.status` : sources personnelles, selon `createdAt`.
- `EnterpriseAiKnowledgeSource.status` : sources entreprises non archivées, selon `createdAt`.
- `AiModelCall` : échecs et annulations classés par code motif, distincts des tentatives de fournisseur.
- `AiToolExecution` : refus de passerelle outillée, classés par code motif et non par identité utilisateur.
- `buildAiCagPack` : signal `cacheHit` journalisé via `prepareAiTurn` dans `ApiLog.metadata.cagCacheHit` ; la Console mesure uniquement les hits/misses **observés** du cache mémoire local par instance (voir ci-dessous), sans prétendre mesurer un cache global.
- Alertes configurables de sécurité : règles canoniques `AiGovernanceAlertRule`, avec `NOT_CONFIGURED` uniquement pour une règle réellement absente. Les règles désactivées et indisponibles sont distinguées.

La période est bornée, le rafraîchissement visible et chaque panne de requête doit produire `null` / « indisponible », sans afficher des zéros trompeurs. Le statut documentaire `READY` signifie une indexation enregistrée comme complète, pas la preuve que le retrieval a abouti ou qu'une citation a été effectivement utilisée.

## Hors de portée de cette première tranche

Aucune nouvelle table de documents ni index parallèle. Aucune extraction ou reindexation globale déclenchée. Les règles d'alertes et la répartition legacy/versionné sont maintenant présentes ; la preuve de citations et la réindexation bornée restent explicitement hors de la première tranche.

## QA et E2E

`pnpm qa:console-ai-knowledge`, `pnpm qa:standard-dtsc-console`, `pnpm qa:regression`, type-check, lint, build ; E2E #804 seulement lorsque les critères d'acceptation sont entièrement satisfaits (RAG personnel/entreprise, refus de lecture tenant, sources vides, sources échouées, FR/EN, mobile, absence de données privées).

**Rollback** : revert des composants de consultation sans modification du stockage de connaissance, sans backfill ni révocation de tokens.


## Règles d'alertes administrables — complément

Le nouveau modèle `AiGovernanceAlertRule` conserve une politique bornée par code `MODEL_FAILURES`, `TOOL_DENIALS`, `KNOWLEDGE_INDEX_FAILURES`, avec `enabled`, `severity`, `threshold`, révision et justification. La migration SQL `20261013170000_ai_governance_alert_rules` est additive et ne modifie aucune source privée.

Les signaux sont recalculés pour **la fenêtre sélectionnée** dans la Console et utilisent des comptes réels de `AiModelCall`, `AiToolExecution`, `KnowledgeDocument` et `EnterpriseAiKnowledgeSource`. Un état `NOT_CONFIGURED`/désactivé/indisponible est explicite. La vue n'envoie **aucune notification automatique** ni incident externe ; elle ne déclare pas un signal sain si ses données sont inaccessibles.

`PATCH /api/admin/ai/alerts` exige `CONSOLE_AI_MANAGE`, contexte interne, même origine, débit limité, schéma strict, motif humain et `expectedRevision` ; toute mutation est transactionnelle avec `PlatformSettingHistory` puis audit de risque élevé. Un conflit renvoie `409`. Désactiver un signal ne modifie pas la télémétrie sous-jacente. Les vraies notifications automatiques, si désirées, nécessiteraient un hotfix distinct explicitement gouverné.

Le rollback conserve les données de règles et l'historique pour éviter de masquer une désactivation de surveillance. Les reindexations massives demeurent interdites ; le script dry-run existant reste l'outil de préparation, sans déclenchement en Production.


## Planification de réindexation bornée, sans mutation

La Console montre un **aperçu des candidats historiques**, au plus `25` par domaine documentaire (personnel et entreprise), selon la fenêtre sélectionnée. Le serveur calcule uniquement des **comptages agrégés** des sources `indexVersion=legacy-openai-1536-v1` disposant de texte préparé, puis plafonne la valeur affichée à `25`. Aucun identifiant n'est sélectionné ou chargé, aucun ordre de traitement n'est déduit de cet aperçu ; le navigateur reçoit uniquement deux compteurs bornés, jamais les identifiants, titres, auteurs, tenants, textes ou chemins de stockage. Une panne de source affiche « indisponible ».

Cet aperçu n'est **pas une exécution** : la Console ne crée aucune tâche de réindexation, ne publie aucune écriture et n'offre aucun bouton de traitement massif. Les opérations individuelles existent déjà sous contrôle du propriétaire du document via `POST /api/documents/[id]/reindex` et du gestionnaire autorisé d'une source entreprise via `PATCH /api/enterprise/ai/knowledge-sources/[id]` avec action `reindex` ; elles conservent leurs vérifications de scope, rate-limit, audit et traitement différé. Un éventuel traitement batch global exigera une Issue dédiée, un plan dry-run, un plafond strict et une validation manuelle indépendante.


## Réindexation bornée : sources canoniques, aucune commande globale

Les deux actions existantes sont **par identifiant d'objet** et non des scans globaux :

- Document personnel : `POST /api/documents/[id]/reindex`, contrôle de session, propriétaire `userId` et `organizationId` actif, origine et rate-limit, puis audit. Un document non préparé est refusé. Cette route ne doit jamais être appelée automatiquement par la Console DTSC.
- Source entreprise : `PATCH /api/enterprise/ai/knowledge-sources/[id]` avec `action="reindex"` et `organizationId` explicitement validé via `getEnterpriseAiAccess(..., "source_manage")`, source non archivée, contenu déjà préparé, rate-limit et audit. Un administrateur global DTSC ne bénéficie d'aucun bypass des permissions de source.

La Console se limite aux **agrégats** et aux versions d'index. Pour réindexer, un utilisateur habilité agit manuellement depuis son espace propriétaire/entreprise sur **une source à la fois**, avec le contrat de permission du domaine et la preuve `KNOWLEDGE_DOCUMENT_REINDEX_REQUESTED` ou `ENTERPRISE_AI_SOURCE_REINDEX_REQUESTED`. Cela évite un nouvel endpoint réindex-global, tout déclenchement de masse et toute fuite du contenu privé vers la Console.

Un `READY` dans la table documentaire indique seulement que l'indexation de cette source a été déclarée achevée ; la qualité du retrieval, la citation prouvée ou le taux de cache CAG exigent des métriques séparées.


## Lisibilité des états (complément)

L'interface du Centre IA traduit les statuts de sources `READY`/`PROCESSING`/`FAILED`/`OTHER` en libellés métier FR/EN, et n'expose plus les noms des modèles Prisma dans les intitulés. Les codes de diagnostic des refus restent des métadonnées de sécurité uniquement pour les administrateurs habilités. Il ne s'agit pas d'une nouvelle preuve de récupération ou d'utilisation des citations. La validation fonctionnelle et l'E2E propriétaire restent requis.


## Preuve de récupération mesurée vs preuve d'utilisation (métrique additive)

Sans créer une source documentaire parallèle ni exposer les contenus, la Console calcule maintenant **deux mesures agrégées** depuis les messages assistants d'entreprise effectivement persistés : nombre de réponses auxquelles au moins un candidat de citation a été joint, et nombre total de candidats joints. La requête filtre `EnterpriseAiMessage` sur `role=assistant`, `deletedAt IS NULL` et sur la fenêtre temporelle demandée. Elle calcule exclusivement les tailles des tableaux JSON en base et ne sélectionne jamais leur contenu, titre, auteur, source, ID ou entreprise. L'échec de cette requête rend le panneau indisponible, pas zéro.

Ces chiffres démontrent seulement que des références de retrieval ont été **rattachées à des réponses sauvegardées**, **pas** qu'elles ont été utilisées, mentionnées ou validées dans le texte généré. Le champ `citationProof.status=NOT_INSTRUMENTED` est maintenu jusqu'à une vraie instrumentation de la correspondance des références dans la sortie du modèle. Ne pas promouvoir la disponibilité ou la qualité du RAG sur ces deux comptages seuls. Le taux observé de réutilisation du cache CAG local est mesuré séparément via les booléens d'audit ; cela ne constitue pas un taux de cache partagé ni une preuve de qualité RAG.

Les opérations de réindexation individuelles existantes restent l'unique voie d'exécution ; le plan Console est non mutateur et plafonné. Les E2E propriétaire sur les sources et permissions restent obligatoires.


### Coût et indexation de la supervision

La lecture agrégée des citations est bornée par date et exclut les messages supprimés. L'index additif `EnterpriseAiMessage(role, deletedAt, createdAt)` (`20261013210000_ai_citation_metadata_window_index`) prend en charge cette fenêtre sans nouvelle table d'analytique ni copie de contenu. Les index PostgreSQL ne garantissent pas à eux seuls une latence constante avec de très grands historiques : surveiller les plans d'exécution et la durée de cette requête en Production. Aucun nettoyage destructif des messages n'est autorisé.


### Mesure du cache contextuel CAG à partir d'observations enregistrées

Le moteur `buildAiCagPack` calcule déjà `cacheHit` à la préparation d'un tour IA ; `prepareAiTurn` l'enregistre via `auditMetadata.cagCacheHit` dans les journaux applicatifs. La Console agrège maintenant ces **booléens réellement enregistrés** depuis `ApiLog.metadata` pour les quatre routes de conversation authentifiées (chat personnel, agent personnel, chat entreprise, agent entreprise). La requête ne sélectionne ni prompt, ni identifiant de compte, ni payload, ni version de cache, uniquement les **comptes d'observations avec réutilisation / recalcul** pour la période.

Le taux affiché est la part de **hits observés dans les logs de préparation**, et non un taux de cache partagé : CAG utilise une `Map` mémoire locale avec TTL, qui peut être renouvelée au redémarrage et n'est pas synchronisée entre instances. Une période sans logs est `NO_OBSERVATIONS` (taux absent) ; une erreur de base est `UNAVAILABLE` (taux absent). Les journaux peuvent comporter des événements d'échec et ne sont pas une preuve du taux de citations effectivement utilisées, ni de l'exactitude de l'IA. Ne pas exposer des clés de cache dérivées d'identité.
