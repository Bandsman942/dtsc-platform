# Changelog — Modules standards DTSC

## Itération 2 — Espace personnel SaaS

### Ajouté

- agrégateur canonique et borné du Dashboard personnel ;
- actions attendues issues des invitations, relations, notifications, tickets et abonnements réels ;
- vue Abonnement alignée sur le catalogue, les entitlements, les limites et la consommation ;
- distinction explicite entre profil professionnel, organisation, membership, relation et contexte actif ;
- recherche et pagination serveur du centre Notifications ;
- historique des invitations et réponses idempotentes ;
- affichage honnête de la session signée actuelle ;
- huit guides utilisateur embarqués et documentaires ;
- audits dédiés et Quality Gate de l’itération 2.

### Renforcé

- changement de contexte : same-origin, rate limit, reason codes, vérification du membership, renouvellement de session et audit ;
- invitation : propriété du destinataire, idempotence, historique et notification de l’émetteur ;
- liens profonds : cible interne précise et contrôle d’accès conservé ;
- performance : requêtes parallèles, compteurs serveur et listes limitées.

### Gouvernance

- aucune migration Prisma ;
- aucune simulation d’archivage de notification ou de registre multi-session ;
- aucune duplication des moteurs ERP ;
- aucun passage automatique vers `COMMERCIAL_READY` ;
- E2E manuels au statut `NON_EXÉCUTÉ`.

## Itération 1 — Fondations professionnelles

### Ajouté

- registre canonique des surfaces non ERP ;
- modèle distinct de statut technique et maturité commerciale ;
- familles, domaines, hosts, plans, dépendances et contrats QA ;
- résolveur central d’accès et capacités ;
- navigation multidomaine et deep links standard ;
- audits registre, navigation, routes, maturité, permissions, guides, langue, mobile, multidomaine et readiness ;
- contrats professionnel, responsive, accessibilité, langue et guides ;
- inventaire initial et plan E2E manuel.

### Gouvernance

- aucune promotion automatique vers `COMMERCIAL_READY` ;
- aucune migration Prisma ;
- aucune duplication d’un moteur ERP ;
- les écarts de guides et routes BETA restent explicitement documentés.

## 2026-08-03 — Itération 03/8

- professionnalisation de Mes collaborateurs, conversations directes et groupes ;
- annuaire global remplacé par une recherche de collaborateurs autorisés ;
- idempotence des conversations et messages ;
- réactions, épinglage, pièces jointes privées, présence et lectures réelles ;
- appels avec refus, annulation, timeout manqué et durée serveur ;
- annonces à audience explicite, brouillons, commentaires paginés et modération ;
- guides, audits et plan E2E ajoutés ;
- maturité `PROFESSIONAL_READY` sans promotion `COMMERCIAL_READY`.

## Stabilisation commerciale du 3 août 2026

Les modules `COLLABORATORS` et `ANNOUNCEMENTS` disposent désormais d’une acceptation propriétaire versionnée. Les liens de messages, mentions, `@tous`, accusés de lecture complets, listes de conversations personnalisées et espacements éditoriaux partagés sont couverts par un audit dédié et par les Quality Gates.

## 2026-08-04 — Itération 04/8 — Coordination du travail

### Ajouté

- agenda de travail unifié avec période bornée, visibilité tenant-scoped, sources canoniques et liens profonds ;
- checklists, progression calculée, dépendances avec détection de cycle et blocages de tâches ;
- filtres personnels persistés sans élargissement des permissions ;
- cycle enrichi des demandes : information, réponse, résolution, clôture et réouverture ;
- versions de soumission, correction motivée, resoumission, délégation et décisions de validation idempotentes ;
- ordre du jour, versions de compte rendu et liens vers des tâches réelles pour les réunions ;
- modèle de rappels dédupliqués ;
- neuf guides utilisateurs, modèles techniques, matrice de permissions, plan E2E et audit d'itération ;
- QA dédiée intégrée à `qa:regression`.

### Réutilisé sans duplication

- moteur de workflows versionné et idempotent existant ;
- documents privés, versions, URLs signées et stockage canonique ;
- `EnterpriseEntityLink` pour les liens documentaires multiples ;
- moteur de notifications et Web Push ;
- commentaires opérationnels/collaboratifs ;
- infrastructure d'appels de Collaboration ;
- services ERP pour les décisions sur achats, budgets et dépenses.

### Corrigé

- déduplication des événements calendrier liés à une tâche, demande, validation, réunion, workflow ou document ;
- conservation simultanée du filtre temporel et du filtre de visibilité des workflows ;
- contrôle des actions de coordination des tâches par utilisateur réel ;
- snapshot des budgets basé sur leurs champs et lignes réels ;
- ouverture précise des tâches, demandes, validations et réunions depuis les liens profonds.

### Gouvernance

- migration additive uniquement ;
- aucune table documentaire ou moteur métier concurrent ;
- Quality Gates et E2E manuels requis avant toute promotion ;
- statut E2E : `NON_EXÉCUTÉ` ;
- aucune promotion de l'itération 04 vers `COMMERCIAL_READY`.
## Itération 5 — IA, connaissance et maturité commerciale

### Ajouté
- catalogue canonique fournisseurs/modèles, routage et fallback ;
- observabilité par appel, prompts versionnés et coûts non inventés ;
- langue/version des sources, citations enrichies et RAG multilingue ;
- registre d’outils permissionnés ;
- huit guides natifs FR/EN ;
- Kanban unifié ERP/standard et transitions persistées.

### Gouvernance
- aucun second moteur de conversation, RAG, i18n, guides ou maturité ;
- aucune mutation sensible activée sans confirmation/idempotence ;
- aucune promotion automatique `COMMERCIAL_READY` ;
- E2E manuel `NON_EXÉCUTÉ`.

## 2026-08-05 — Itération 07 : Console DTSC professionnelle

- routes Console canoniques et aliases historiques ;
- chargement par section sans mutation au rendu ;
- pagination utilisateurs, organisations, abonnements, support, contenu et audit ;
- capacités RBAC Console et permissions individuelles ;
- protection du dernier administrateur ;
- versionnement des plans et publications ;
- SLA Support, incidents, feature flags, webhooks idempotents et exports audités ;
- i18n, guides natifs et cartes Kanban `STANDARD-07` ;
- statut E2E : `NON_EXÉCUTÉ`.
