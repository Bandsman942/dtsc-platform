# Audit — modules standards — Itération 04

## État du rapport

- Branche : `feat/standard-modules-professionalization-iteration-04-work-coordination`
- Base initiale : `b05d2cdfa58d52334a93e277e45cdaab315dcce9`
- PR : `#68`
- E2E propriétaire : `NON_EXÉCUTÉ`
- Promotion maximale autorisée avant E2E : `PROFESSIONAL_READY`
- Promotion `COMMERCIAL_READY` : interdite à ce stade

## Périmètre réellement traité

### Calendrier

- API d'agrégation bornée et tenant-scoped ;
- sources : calendrier, tâches, demandes, validations, réunions, workflows et échéances documentaires ;
- déduplication par source canonique ;
- liens profonds ;
- agenda unifié responsive ;
- conservation du calendrier et des disponibilités existants.

### Tâches

- checklist et progression calculée ;
- dépendances persistées avec détection de cycle ;
- blocages et résolution historisés ;
- filtres personnels persistés ;
- panneau de coordination et ouverture par `?task=`.

### Demandes

- demande d'information et réponse ;
- résolution, clôture et réouverture ;
- commentaires et événements ;
- notifications liées ;
- interface et ouverture par `?request=`.

### Validations

- snapshot versionné ;
- correction motivée, resoumission et délégation ;
- décision idempotente ;
- synchronisation via les services métier existants ;
- écran d'action et ouverture par `?approval=`.

### Réunions

- ordre du jour persistant ;
- versions de compte rendu ;
- conflits de participants visibles ;
- décision vers vraie tâche et liens de tâches ;
- réutilisation de l'infrastructure d'appel ;
- ouverture par `?meeting=`.

### Workflows

- réutilisation du moteur versionné existant ;
- étapes, transitions, acteurs, action attempts et outbox idempotents ;
- projection des reprises dans le Calendrier ;
- documentation des limites du lien profond des instances.

### Documents

- réutilisation des documents, versions, accès, stockage privé et URLs signées existants ;
- liens multiples via `EnterpriseEntityLink` ;
- aucune nouvelle table concurrente de fichiers ou de liens ;
- guide et contrôles statiques dédiés.

## Migration

La migration additive ajoute uniquement les modèles manquants de coordination : checklist, dépendance, blocage, filtre personnel, version/décision de validation, ordre du jour, versions de compte rendu, liens réunion-tâche et rappels.

Elle ne modifie aucune migration historique et ne crée plus de table documentaire concurrente.

## Sécurité

Contrôles audités : session, same-origin, rate limit, organisation, membership actif, accès module, visibilité objet, acteur, validateur, révision, état, source tenant-scoped et URL signée.

Les filtres personnels ne modifient pas les prédicats de visibilité. Les liens profonds revérifient l'accès au chargement.

## Performance

- plage calendrier maximale : 93 jours ;
- limites par source : 500 éléments ;
- listes métier paginées ;
- fichiers chargés uniquement à la demande ;
- historique des coordinations borné ;
- aucune lecture de tout l'historique workflow dans les listes.

## Documentation livrée

- modèle canonique ;
- agrégation calendrier ;
- modèles activités/tâches, demandes, validations, réunions, workflows et documents ;
- matrice de permissions ;
- liens profonds ;
- notifications et rappels ;
- neuf guides utilisateurs ;
- plan E2E manuel.

## QA

`qa:standard-modules-iteration-04` agrège les audits statiques de calendrier, activités, tâches, demandes, validations, réunions, workflows, documents, notifications et guides. Il est ajouté à `qa:regression` sans suppression des QA antérieures.

Les résultats définitifs de type-check, lint, build, migration propre et régression doivent être repris depuis les Quality Gates de la PR. Ce rapport ne marque pas un contrôle comme réussi avant son résultat réel.

## Limitations et dettes restantes

1. Les activités DTSC historiques et le socle entreprise restent deux domaines de stockage distincts.
2. Les statuts Core v2 historiques coexistent avec le cycle enrichi des demandes pour compatibilité.
3. Le lien profond `?run=` des workflows est généré, mais l'ouverture automatique du détail reste à confirmer par E2E ou à compléter dans l'interface.
4. Les SLA complexes, ressources de calendrier, créneaux automatiques et calendriers externes ne sont pas annoncés.
5. Le worker d'envoi des rappels doit être vérifié séparément ; le modèle de données seul ne vaut pas preuve d'envoi.
6. Les tests E2E manuels restent à la charge du propriétaire après Production.

## Rollback

Le rollback applicatif peut désactiver l'agenda unifié, les panneaux de coordination ou les nouvelles actions tout en conservant les tables additives. Les décisions, versions, fichiers et historiques ne doivent pas être supprimés. Les retries restent idempotents après correction.

## Maturité provisoire

| Module | Statut maximal provisoire | Condition restante |
|---|---|---|
| Calendrier | PROFESSIONAL_READY si CI verte | E2E multi-sources/mobile |
| Activités DTSC | OPERATIONAL / à confirmer | E2E des domaines historiques |
| Activités entreprise | PROFESSIONAL_READY si CI verte | E2E formulaire et notification |
| Tâches | PROFESSIONAL_READY si CI verte | E2E checklist/cycle/filtre |
| Demandes | PROFESSIONAL_READY si CI verte | E2E information/réouverture |
| Validations | PROFESSIONAL_READY si CI verte | E2E multi-utilisateur/version |
| Réunions | PROFESSIONAL_READY si CI verte | E2E conflits/appel/compte rendu |
| Workflows | PROFESSIONAL_READY selon QA moteur | E2E version/retry/deep link |
| Documents | PROFESSIONAL_READY selon QA stockage | E2E upload/URL directe/version |

**Tests E2E manuels préparés — validation du propriétaire en attente**
