# Checklist QA — Common Enterprise Workflow Engine

## Précondition

- [ ] Le point de départ est le `main` contenant Sprint 8.
- [ ] `EnterpriseBudget`, `EnterpriseBudgetLine`, `EnterpriseBudgetCommitment`, `EnterpriseExpense` et `EnterpriseReport` sont présents.
- [ ] Les modèles Sprints 6 et 7 restent présents.
- [ ] Aucun code Sprint 9 ne dépend directement d’une branche Sprint 8 non fusionnée.

## Définitions et versions

- [ ] Un administrateur entreprise peut créer un workflow DRAFT.
- [ ] `organizationId + code` est unique.
- [ ] Une version publiée est immuable.
- [ ] Créer une nouvelle version duplique la version source en DRAFT.
- [ ] Une seule version est PUBLISHED par définition.
- [ ] Un run existant reste lié à sa version initiale après publication d’une nouvelle version.
- [ ] Aucun template financier n’est automatiquement publié.

## Graphe et readiness

- [ ] 0 START bloque la publication.
- [ ] 2 START bloquent la publication.
- [ ] Aucun END bloque la publication.
- [ ] Un step orphelin bloque la publication.
- [ ] Un cycle bloque la publication.
- [ ] Une étape inaccessible bloque la publication.
- [ ] Une condition sans TRUE/FALSE bloque la publication.
- [ ] Une validation sans APPROVED/REJECTED bloque la publication.
- [ ] Une action ou un champ non autorisé par l’adapter bloque la publication.
- [ ] Les blocages sont affichés avec un message explicite.

## Conditions et assignations

- [ ] Les montants sont comparés via Decimal.
- [ ] Aucun `eval`, script utilisateur, SQL ou regex arbitraire n’est accepté.
- [ ] SPECIFIC_USER valide le membership actif de la même organisation.
- [ ] DEPARTMENT_MANAGER exige un responsable actif.
- [ ] Une assignation introuvable bloque le run.
- [ ] Un approbateur égal au demandeur bloque le run.
- [ ] Aucun user d’une autre organisation ne peut être assigné.

## Runtime

- [ ] Un workflow manuel publié démarre sur une entité valide.
- [ ] Un workflow DRAFT ne démarre pas.
- [ ] Le run conserve `workflowVersionId`.
- [ ] Le step courant est persistant.
- [ ] Chaque step produit un step run et une timeline.
- [ ] Les statuts RUNNING, WAITING_APPROVAL, WAITING_TIME, BLOCKED, COMPLETED, REJECTED, FAILED et CANCELLED sont cohérents.
- [ ] Deux runners ne claim pas simultanément le même step.

## Domain adapters

- [ ] Task utilise le service Sprint 6.
- [ ] Request utilise le service Sprint 6.
- [ ] Meeting utilise le service Sprint 6.
- [ ] Purchase utilise le service Sprint 7.
- [ ] Budget, Expense et Report utilisent les services Sprint 8.
- [ ] Aucun `prisma[entityType]` n’existe.
- [ ] Aucun patch Prisma direct de statut métier n’existe dans le moteur.
- [ ] PHARMACY stock et HEALTH_CARE clinique ne sont jamais modifiés par le moteur V1.

## Approvals

- [ ] CREATE_APPROVAL réutilise `EnterpriseApproval`.
- [ ] Les liens `workflowRunId` et `workflowStepRunId` sont présents.
- [ ] Une approbation déjà créée par Purchase/Budget/Expense est liée, non dupliquée.
- [ ] APPROVED reprend la branche APPROVED.
- [ ] REJECTED reprend la branche REJECTED.
- [ ] CANCELLED reprend la branche CANCELLED si configurée.
- [ ] Deux approvals PENDING ne sont pas créées simultanément dans le workflow séquentiel V1.
- [ ] Les services de décision existants restent autoritatifs.

## Idempotency et retry

WF-00 (#813) : commandes et limites des preuves dans [le runbook](WORKFLOW_RUNTIME_RECOVERY.md).

- [ ] QA comportementale PostgreSQL après migrations propres : deux workers, expiration réelle, tentative maximale et DEAD, dans les deux modes.
- [ ] Reprise après effet/avant confirmation : tâches atomiques, validations liées, notifications déterministes ; aucune reprise forcée d’un effet indéterminé.
- [ ] Attente relative à échéance conservée après crash et reprise concurrente ; redelivery d’un run terminé.
- [ ] Annulation concurrente : aucune étape future, effet déjà réussi conservé.
- [ ] Diagnostics de récupération FR/EN ; jeton/bail internes absents des API.
- [ ] OWNER_E2E : interruption/reprise contrôlée, attente courte, audit et absence de doublons sur desktop/mobile.

- [ ] Le même DomainEvent ne crée qu’un run par version/source.
- [ ] Une action de step possède une clé stable.
- [ ] Un retry de CREATE_TASK ne crée pas une seconde tâche.
- [ ] Un retry de CREATE_APPROVAL ne crée pas une seconde validation.
- [ ] Un retry de NOTIFICATION ne crée pas une seconde notification.
- [ ] Une action déjà RUNNING ne peut pas être exécutée simultanément.
- [ ] Une erreur TRANSIENT est réessayée au plus trois fois.
- [ ] Une erreur BUSINESS ou CONFIGURATION ne boucle pas.
- [ ] Le retry manuel reprend le step courant, jamais START.

## Wait et worker

- [ ] WAIT_UNTIL persiste WAITING_TIME et resumeAt.
- [ ] Une date passée avance immédiatement.
- [ ] Une durée négative/infinie/invalide est refusée.
- [ ] Le worker traite au plus 20 événements.
- [ ] Le claim utilise `FOR UPDATE SKIP LOCKED`.
- [ ] Deux workers ne traitent pas le même événement.
- [ ] Les leases expirées peuvent être reprises.
- [ ] Après le nombre maximal de tentatives, l’événement devient DEAD.
- [ ] Un appel worker sans secret reçoit 401.
- [ ] Le secret n’apparaît dans aucun log ou payload.

## Transactional outbox

- [ ] Un `EnterpriseOperationalEvent` allow-listé crée `EnterpriseDomainEvent` dans la même transaction.
- [ ] Le payload contient uniquement statuts, acteur et timestamp nécessaires.
- [ ] Le payload ne copie ni documents, ni données cliniques, ni coordonnées bancaires.
- [ ] Un événement dupliqué est absorbé par l’idempotency key.

## Cancellation

- [ ] Annuler un run actif empêche les steps futurs.
- [ ] Les step runs non terminaux deviennent CANCELLED.
- [ ] Une approval liée encore PENDING est annulée via son service.
- [ ] Les actions déjà réussies restent présentes.
- [ ] La timeline reste complète.
- [ ] Aucun rollback ou compensation automatique n’est tenté.

## RBAC et isolation

- [ ] Seul un membre actif du tenant client lit les workflows.
- [ ] Les droits create/edit/publish/retire/start/view/retry/cancel sont séparés.
- [ ] DTSC global ADMIN sans membership client reçoit 403.
- [ ] Les mutations utilisent same-origin, rate limit et Zod.
- [ ] Workflow A → entité B est refusé.
- [ ] Workflow A → user B est refusé.
- [ ] Workflow A → approval B est refusé.
- [ ] Workflow A → task B est refusé.

## UI / UX

- [ ] Les vues Définitions, Exécutions et À surveiller sont disponibles.
- [ ] Les KPI sont compacts et responsive.
- [ ] L’éditeur utilise une liste ordonnée, pas un canvas BPMN.
- [ ] Les formulaires de steps sont structurés, pas un JSON brut comme expérience principale.
- [ ] Les codes techniques sont traduits FR/EN.
- [ ] Les dialogs restent utilisables sur 320, 375, 390, 414, 768, 1024 et 1440 px.
- [ ] iOS/PWA conservent clavier, safe areas, selects et navigation basse.

## Régressions

- [ ] Sprint 6 QA passe.
- [ ] Sprint 7 QA passe.
- [ ] Sprint 8 QA passe.
- [ ] Sprint 9 QA passe.
- [ ] PHARMACY et HEALTH_CARE restent isolés.
- [ ] DTSC_INTERNAL planning, prestations et paie restent stables.
- [ ] Sessions, Web Push, mobile/iOS, PWA, Chatbot et IA Assistant Entreprise restent stables.

## CI/CD et production

- [ ] `git diff --check` et `git diff --cached --check` sont propres.
- [ ] Type-check passe.
- [ ] Lint passe.
- [ ] `qa:regression` passe.
- [ ] Migration-from-scratch passe.
- [ ] Build passe.
- [ ] La Preview fonctionnelle reste désactivée.
- [ ] La PR est reviewée avant merge.
- [ ] Le merge normal sur main déclenche l’unique Production Vercel.
- [ ] `prisma migrate deploy` applique Sprint 9.
- [ ] `pnpm build` production réussit.
- [ ] Le SHA main correspond au SHA production.
- [ ] Le worker protégé et son ordonnanceur production sont vérifiés sans exposer le secret.

## WF-01 — Contrats ERP (#814)

- [ ] Les quatre modèles Demande/Achat/Budget/Dépense exécutent leurs branches avec un approbateur distinct.
- [ ] Les cinq modèles financiers restent visibles avec justification FR/EN, création désactivée et refus serveur ; aucune approbation ou action sensible ajoutée.
- [ ] Toute condition de transition utilise un champ autorisé et une valeur de type correct ; les branches sans couverture, masquées ou impossibles bloquent la publication.
- [ ] Après mutation, le nouvel état détermine la branche ; un changement de tenant/identité ou une révision antérieure bloque la reprise.
- [ ] Les services canoniques refusent mauvais acteur, tenant, rôle et révision ; une décision concurrente ne produit qu’une approbation.
- [ ] Les versions publiées et `EnterpriseWorkflow` historique restent immuables/lecture seule.
- [ ] OWNER_E2E : achat avec validateur distinct, paiement après validation dans son module, clôture indépendante, modèle incompatible refusé avant publication ; desktop/mobile, FR/EN, clair/sombre et clavier.

Automatisation : `pnpm qa:workflow-contracts` et `pnpm qa:workflow-contracts:postgres` (base PostgreSQL locale de test uniquement). Les preuves automatiques ne remplacent pas OWNER_E2E.


## WF-02 — Accès et identité (#815)

- [ ] Workflow module/entitlement interdit malgré rôle OWNER si abonnement inéligible.
- [ ] MANAGER sans permission explicite ne peut pas démarrer, publier, voir tous les runs ou annuler.
- [ ] Permissions du poste et des rôles d'organisation actifs sont appliquées.
- [ ] Source ERP désactivée/interdite refuse création, publication, lancement, retry et cancel.
- [ ] La révocation du membre initiateur bloque la prochaine mutation ; aucun remplacement automatique par un autre membre.
- [ ] Runs/métriques/détails et événements restent tenant-scoped et limités aux données visibles.
- [ ] Les 11 routes gardent same-origin, validation, rate limit et journaux sur leurs mutations.
- [ ] `pnpm qa:workflow-security`, lint, type-check, régression, build et migration GitHub réussissent.
- [ ] OWNER_E2E #815 : matrice des rôles, révocation, cross-tenant, source ERP et SoD.
- [ ] SHA Production == SHA main après E2E et merge seulement.


## WF-03 — Révision immuable, lancement et suivi (#816)

- [ ] Publication initiale produit définition ACTIVE + version PUBLISHED, visible dans Activités.
- [ ] PATCH comportemental d’une définition ACTIVE ou RETIRED reçoit `WORKFLOW_PUBLISHED_TRIGGER_IMMUTABLE` (HTTP 409).
- [ ] PATCH nom/description reste possible ; nouvelle version brouillon peut modifier étapes mais pas les triggers historiques.
- [ ] Double publication, revue périmée et édition simultanée ne changent pas l’état publié sans relecture : transaction SERIALIZABLE et token vérifié avant mutation.
- [ ] Module Workflows donne un formulaire manuel aux seuls utilisateurs `canStartManual`, sur définition ACTIVE avec `allowManualStart`.
- [ ] Sélecteur de sources ne montre que l’organisation courante et les objets autorisés ; ID externe et source d’un autre membre/tenant refusés côté API.
- [ ] Sélecteurs non encore certifiés explicitement indisponibles ; aucun champ d’UUID libre ni résultat fictif.
- [ ] Lien profond `?runId` ouvre l’exécution précise sous permissions ; 403 vs 404 distinction vérifiée.
- [ ] Liste paginée (20) : une exécution en page 3 reste accessible et filtres de statut réinitialisent la pagination.
- [ ] Contrôles FR/EN, mode clair/sombre, clavier et mobile 320/360/375/390/414/768/1024.
- [ ] `pnpm qa:workflow-publish-manual`, `pnpm qa:enterprise-workflows`, type-check, lint, régression et build réussis.
- [ ] OWNER_E2E #816 humain requis avant merge et Production.


## WF-04 — Monitoring et incidents (#817)

- [ ] API `workflow-runs` : statistiques dérivées des mêmes runs visibles, mêmes filtres statut/module/démarreur.
- [ ] P50/P95/P99 bornés à 500 derniers runs des 30 derniers jours ; échantillon plafonné affiché et champ `sampledAt` précis.
- [ ] Échec sans `completedAt` et anomalie de durée négative sont exclus ; absence = null et non zéro fictif.
- [ ] Temps d'attente estimé depuis `updatedAt` présenté comme tel, jamais SLA métier exact.
- [ ] Tous les états d'outbox (ready, processing, staleProcessing, dead) restent privés et les totaux concernent la queue partagée, pas le tenant.
- [ ] `pnpm qa:workflow-observability`, suites WF-00/WF-01 PostgreSQL, type-check, lint, régression, build, Migration Gate.
- [ ] E2E réel : run terminé/WAITING/BLOCKED/FAILED/retry/cancel + récupération lease + rôles + tenant B.
- [ ] Dépendance #816 fusionnée avant fusion #817.


## WF-05 — Studio visuel et round-trip (#818)

- [ ] Dans une définition DRAFT autorisée, studio fonctionnel et formulaire structuré sont disponibles, aucun droit absent n'est contourné.
- [ ] Créer un graphe 10+ nœuds ; connecter une branche TRUE/FALSE puis APPROVED/REJECTED, modifier noms et positions par souris/clavier.
- [ ] Enregistrer, rafraîchir, rouvrir : toutes coordonnées, conditions, configurations et transitions sont conservées, sans altération de la version PUBLISHED.
- [ ] Undo/redo (max. 20 snapshots) gère création, suppression, déplacement, connexions et retouches de libellés.
- [ ] Lire et éditer avec clavier seul, lecteur d’écran, focus et noms accessibles ; mode clair/sombre, FR/EN.
- [ ] Tester largeur 320/360/375/390/414/768/1024 : liste mobile fonctionnelle, aucun débordement horizontal global, zoom desktop et labels longs.
- [ ] Contrôle de modification concurrente du même brouillon ; aucune sauvegarde ne supprime silencieusement des transitions.
- [ ] Publication uniquement via readiness et revue humaine, aucune exécution depuis le canevas ; modules source/RBAC toujours vérifiés côté serveur.
- [ ] `pnpm qa:workflow-visual-roundtrip`, typecheck, lint, régression et Quality/Migration Gates du HEAD actuel réussis.
- [ ] OWNER_E2E #818 explicite requis avant la fusion.


### Vérifications complémentaires WF-05 — collisions d'édition

- [ ] Deux membres ouvrent le même DRAFT, A déplace un nœud et enregistre, puis B tente de sauvegarder son ancien graphe : **409 WORKFLOW_DRAFT_CONFLICT**, étapes/branches de A conservées.
- [ ] Le conflit ne vide ni le formulaire de B ni ses choix ; message de rechargement clair en FR/EN.
- [ ] Un PATCH sans `editToken` ou avec token mal formé échoue HTTP 400 avant toute écriture.
- [ ] Une version PUBLISHED répond 409 sans écriture ; une organisation différente répond 403/404 selon le contrôle d'accès.
- [ ] Le token provient du serveur seulement si `canEditDraft`, n'est ni un JWT, ni un secret, ni un bypass RBAC.
- [ ] La sauvegarde prend un verrou `FOR UPDATE` sur la ligne de version avant comparaison du snapshot et avant mutation ; le studio ne contourne pas le verrou.
- [ ] `pnpm qa:workflow-visual-concurrency` et `pnpm qa:workflow-visual-roundtrip` intégrés aux Quality Gates et à la régression ; navigateur authentifié restant.


### Propriétés/duplication du studio — WF-05

- [ ] Duplication de CONDITION/APPROVAL/TASK conserve la configuration et ajoute un nouveau code unique sans copier les branches ; START/END ne sont pas dupliquables.
- [ ] La modification des propriétés avancées JSON rejette valeurs mal formées et schémas invalides ; des configurations existantes sont préservées si non modifiées.
- [ ] Après une mutation validée, l'état dirty est affiché, undo/redo fonctionnent et la sauvegarde PATCH exige un token à jour.


## WF-06A — contrat DST non exécutable (#837)

- [ ] `pnpm qa:workflow-schedule-dst` passe pour UTC, Africa/Kinshasa, Paris et New York, dont les transitions DST 2026 (spring missing SKIP, fall FIRST).
- [ ] Les horaires NEXT strictement après UTC, hebdomadaires et date civile locale restent déterministes et bornés ; mauvaises zones IANA, champs inconnus et cron non supporté sont refusés.
- [ ] La clé d'occurrence change selon tenant/schedule/version et reste la même pour la même date/heure locales ; son hash ne remplace pas une contrainte UNIQUE en DB.
- [ ] Aucune nouvelle route, déclencheur exécutable, Cron Vercel, table Prisma ou mutation de données ; V1 DAG et ses tests restent identiques.
- [ ] Quality/Migration, type-check, lint, régression, build réussis sur le SHA final ; OWNER_E2E #837 explicite avant fusion.
- [ ] Pour #819 parent : ne pas cocher l'E2E « automation à l'heure » avant une tranche scheduler persisté et testée sur une vraie organisation.


## WF-06B — Conditions composites et mapping (#839)

- [ ] `pnpm qa:workflow-data-conditions` passe : AND/OR stricts, branches invalides ignorées par un court-circuit rejetées, profondeur ≤4, feuilles ≤24, noms de variable protégés.
- [ ] Le tenant source et le tenant actif doivent être identiques avant toute lecture, et même un arbre de milliers de niveaux doit être refusé avant parsing récursif.
- [ ] Seuls les champs de l'adapter également autorisés par `readableFields` peuvent être projetés, y compris pour les montants ; aucune lecture d'un champ refusé.
- [ ] Nombres décimaux précis, dates normalisées, scalaires uniquement, payload ≤4 Ko, 16 variables maximum.
- [ ] Le moteur V1, le registre de nœuds et les données Prisma ne sont pas modifiés, la publication/exécution V1 ne reconnaît pas implicitement AND/OR.
- [ ] Typecheck, lint, régression, build, Delivery Governance, Migration Gate du dernier SHA passent ; OWNER_E2E #839 humain nécessaire avant fusion.


## WF-06S1 — Persistence atomique d'occurrences, non activée (#841)

- [ ] `pnpm qa:workflow-schedule-ledger:postgres` passe sur PostgreSQL isolé et sous migrations from scratch.
- [ ] Les reçus possèdent un index UNIQUE par tenant/schedule/version/date locale/heure locale et une clé SHA-256 UNIQUE ; toutes les FKs composées refusent mix de versions/définitions/tenants.
- [ ] 12 transactions concurrentes ne créent qu'un reçu et font progresser le curseur avec CAS ; un replay ne double pas l'occurrence, un rollback ne perd pas le curseur.
- [ ] Le DST New York 2026 (heure répétée) choisit FIRST uniquement ; le deuxième instant ne devient pas une nouvelle occurrence.
- [ ] Les horaires restent DISABLED par défaut ; aucune route/API/cron/worker ne peut activer des exécutions à travers cette tranche. `EnterpriseWorkflowRun` reste vide pour le test.
- [ ] Prisma generate/validate, diff-check, type-check, lint, régression, Quality/Migration, build et OWNER_E2E #841 explicitement validés avant fusion.

## WF-06S2A — API de préparation DISABLED seulement (#844)

- [ ] L'API liste uniquement les horaires DISABLED de l'organisation active et des sources ERP réellement lisibles, avec pagination bornée.
- [ ] Seul un acteur avec membership/client actif, module/abonnement WORKFLOWS, permission de création et module source autorisé peut ajouter un horaire ; accès depuis tenant B ou contexte DTSC_INTERNAL refusé.
- [ ] Le POST n'admet pas `status` client, ID étranger, ancienne version ou workflow archivé ; `nextRunAt` suit DST SKIP/FIRST.
- [ ] Un horaire créé reste `DISABLED`, même lorsqu'il possède un prochain curseur ; 0 occurrence, 0 outbox, 0 run et 0 effet financier.
- [ ] PostgreSQL QA `node scripts/qa-workflow-844-postgres.mjs` réussie sur Quality ET Migration : service réel, handlers GET/POST réels sous doubles contrôlés d'auth/source, refus 401/403/429/400, pagination et visibilité STAGED ; migrations propres, lint, types, QA régression et build CI.
- [ ] OWNER_E2E #844 explicite avant toute fusion, puis #843 couvre l'activation réelle, la source liée à une entité, l'acteur, les quotas, le scheduler, la transaction outbox/run et le replay/crash.

## WF-06S2B — Liaison de mandat métier inerte (#846, parent #843)

- [ ] PATCH refusé en contexte DTSC, sans session, sans permission WORKFLOWS edit, sans accès module source, et avec mauvaise origine/rate-limit.
- [ ] Type ERP tiré uniquement de la définition persistée ; impossible de fournir le type, l'identité d'un autre acteur ou le statut ENABLED côté client.
- [ ] Un ID source ERP d'une autre entreprise ou archivé est refusé ; snapshot privé jamais renvoyé, source/acteur réellement mandatés en base.
- [ ] Définition non active, version remplacée/retirée, membership révoqué et conflits revision refusés ; DB empêche une liaison partielle même via SQL direct.
- [ ] Source/acteur/time tous NULL sur les anciens horaires ; statut toujours DISABLED, aucun run/event/occurrence créé ou consommé, aucun worker/cron modifié.
- [ ] Quality et Migration : `node scripts/qa-workflow-846-postgres.mjs` sur DB locale propre, migrations, lint, types, régression et build CI.
- [ ] OWNER_E2E #846 distinct, avant squash merge ; réalisation du scheduler réel reportée à #843.

## WF-06S2C — Préflight inerte d'éligibilité (#848, parent #843)

- [ ] Preflight uniquement serveur, non appelé par cron/worker, refuse tout statut autre que DISABLED et retourne `INERT_READINESS_ONLY` sans snapshot ERP.
- [ ] Entreprise CLIENT active, version PUBLISHED courante, mandat source+acteur complet et source ERP authentifiée dans le même tenant ; entitlements WORKFLOWS et module ERP réévalués, acteur actif.
- [ ] Mandat révoqué, module désactivé, objet supprimé ou d'un tenant B, version retirée : échec fermé sans modification de base.
- [ ] Curseur DST FIRST au premier 01:30 automnal, seconde occurrence refusée ; anciennes échéances >24h refusées sans catch-up massif.
- [ ] Plafonds techniques 10 par définition et 50 par entreprise vérifiés, identifiés comme **non commerciaux**, les quotas plan resteront dans #843.
- [ ] PostgreSQL QA `node scripts/qa-workflow-848-postgres.mjs` certifiée en Quality et Migration ; 0 run, 0 occurrence, 0 domain event, aucune API d'activation.
- [ ] Typecheck, lint, régression et build CI SUCCESS ; **OWNER_E2E #848** explicite avant toute fusion.

## WF-06S2D — Reçus inertes (#850, parent #843)

- [ ] Migration additive depuis base vide, Prisma generate, ancien ledger toujours compatible.
- [ ] RESERVED obligatoire, colonnes claim/run/outbox nulles, défauts et revision positif garantis par CHECKs.
- [ ] Index uniques run/outbox, FKs composites interdisant les références cross-tenant.
- [ ] `node scripts/qa-workflow-850-postgres.mjs` sur deux tenants dans Quality + Migration : 11 mutations interdites et 0 ERP run/event.
- [ ] Type-check, lint, régression et build CI SUCCESS, OWNER_E2E #850 explicite avant fusion.
- [ ] Aucun worker, Cron, API, ENABLED ou effet métier ; activation sécurisée distincte #843.

## WF-06S2E1 — Inventory lock probe STRICTEMENT INERTE (#853, parent #852)

- [ ] La fonction est serveur uniquement, non appelée par API, Cron, worker ou service d'exécution; `INERT_DISPATCH_LOCK_PROBE_ONLY` ne confère aucun grant.
- [ ] 3 tenants isolés (un inactif), horaires DISABLED/STAGED, uniquement reçus RESERVED, échus dans les dernières 24 h et curseur asOf récent.
- [ ] `LIMIT 21` borne à 20 sorties; SKIP LOCKED ignore une ligne verrouillée par une transaction concurrente puis l'observe une fois libérée; pas de promesse de backlog total.
- [ ] Aucun champ sourceEntityId, actor, payload sensible; aucun run, outbox ou mutation de reçu, statut et updatedAt inchangés.
- [ ] PostgreSQL QA `node scripts/qa-workflow-853-postgres.mjs` dans Quality ET Migration, puis type-check, lint, regression, build CI SUCCESS.
- [ ] OWNER_E2E #853 BON distinct avant fusion; Production READY #850 prérequis.
- [ ] #852 doit encore ajouter le véritable claim, le droit live atomique, quotas plan, outbox/run unique, crash-retry et kill-switch avant tout ENABLED.

## WF-06S2E2 — Lease/fencing purs, NON EXÉCUTABLES (#855, parent #852)

- [ ] Vérifier que `INERT_LEASE_PLAN_ONLY` et `INERT_LEASE_FENCE_ONLY` ne sont pas des permissions, qu'aucun token/acteur/payload n'est renvoyé, et que la source n'est jamais importée par worker, API ni Cron.
- [ ] Clés d'occurrence tenant/version/local date/local time vérifiées contre le calcul WF-06A ; deuxième 01:30 New York fall-back identique, tenant B différent.
- [ ] 12 intentions simultanées ne sont PAS 12 claims : elles ont toutes la même révision CAS attendue, mais seul un futur UPDATE conditionnel en transaction pourra établir l'unique gagnant.
- [ ] Cas négatifs : statut non RESERVED, révision 0/overflow, claim déjà existant, linked run/outbox, future/stale >24 h, token erroné, lease expiré, échec après max 3 tentatives.
- [ ] La contrainte réelle PostgreSQL #850 reste RESERVED-only et interdit CLAIMED ; aucune migration, job ni paiement, aucun bypass ou exécution automatique.
- [ ] `node scripts/qa-workflow-855-lease-policy.mjs` dans Quality ET Migration, puis les autres gates GitHub Quality/Migration et OWNER_E2E #855 explicite avant squash merge.
- [ ] Le dispatcher #852 doit encore intégrer locking + revalidation droits/entitlements/plan + CAS atomique run/outbox ; ne pas considérer la QA pure comme QA de concurrence PostgreSQL.
