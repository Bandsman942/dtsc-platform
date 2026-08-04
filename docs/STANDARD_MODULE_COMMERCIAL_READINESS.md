# Maturité commerciale des modules standards

## Niveaux

- `BACKEND_READY` : backend principal présent, expérience insuffisante.
- `READ_ONLY_UI` : lecture disponible, opérations incomplètes.
- `OPERATIONAL_UI` : parcours principaux opérationnels, écarts professionnels restants.
- `PROFESSIONAL_READY` : contrats architecture, accès, UX, sécurité, documentation et QA satisfaits.
- `COMMERCIAL_READY` : validation manuelle explicite du propriétaire après Production.

## Séparation obligatoire

Le statut technique (`ACTIVE`, `BETA`, `PLANNED`, `HIDDEN`, `DEPRECATED`, `RETIRED`) ne détermine jamais automatiquement la maturité commerciale.

## Promotion commerciale

`COMMERCIAL_READY` exige : Quality Gates verts, Production issue de `main`, migrations et build stables, tests E2E manuels, validation explicite du propriétaire et preuve versionnée. Une PR de promotion séparée est recommandée.

Aucun module standard n’est promu vers `COMMERCIAL_READY` automatiquement, par simple succès d’un audit, d’un build ou d’un déploiement.

## Évaluation de l’itération 2

| Module | Avant | Cible après Quality Gates | Preuves principales | Limite commerciale |
|---|---|---|---|---|
| Dashboard | `OPERATIONAL_UI` | `PROFESSIONAL_READY` | contexte canonique, actions réelles, agrégats bornés, guide, audit | E2E propriétaire requis |
| Abonnement | `OPERATIONAL_UI` | `PROFESSIONAL_READY` | catalogue, entitlements, usage, factures et paiements SaaS | parcours fournisseur à valider manuellement |
| Entreprise du compte | `OPERATIONAL_UI` | `PROFESSIONAL_READY` | modèle profil/organisation/membership/relation documenté | E2E multi-organisation requis |
| Profil | `OPERATIONAL_UI` | `PROFESSIONAL_READY` | persistance existante, avatar réel, visibilité explicitée, guide | changements d’identifiant sensible hors formulaire standard |
| Paramètres | `OPERATIONAL_UI` | `PROFESSIONAL_READY` | préférences persistées, Push réel, session signée actuelle | pas de registre multi-session persistant |
| Notifications | `OPERATIONAL_UI` | `PROFESSIONAL_READY` | visibilité canonique, recherche et pagination serveur, liens profonds | archivage structuré non simulé |
| Invitations | `OPERATIONAL_UI` | `PROFESSIONAL_READY` | visibilité hors contexte, destinataire vérifié, idempotence, audit | expiration métier dépend du modèle existant |
| Relations avec les entreprises | `OPERATIONAL_UI` | `PROFESSIONAL_READY` | moteur canonique, consentements, liens précis, guide | validation manuelle des scénarios de révocation |

La cible `PROFESSIONAL_READY` n’est acquise qu’après succès de la PR, fusion dans `main` et vérification de la Production correspondante.

## Gouvernance de l’itération 2

- aucune promotion vers `COMMERCIAL_READY` ;
- les limitations connues restent documentées et ne sont pas maquillées par des contrôles fictifs ;
- la validation commerciale dépend des E2E manuels explicites du propriétaire ;
- une régression critique constatée après fusion doit dégrader le module concerné.

## État de l’itération 1

Aucun module standard n’a été promu vers `COMMERCIAL_READY`. Les fondations de l’itération 1 restent la base opposable des itérations 2 à 8.

## Itération 03 — Évaluation séparée

| Capacité | Statut après automatisation | Condition restante |
|---|---|---|
| Mes collaborateurs | COMMERCIAL_READY | Validation propriétaire versionnée |
| Conversations directes | COMMERCIAL_READY | Sélection, liens et filtres validés |
| Groupes et messagerie | COMMERCIAL_READY | Mentions, @tous, réponses et lectures stabilisés |
| Médias et réactions | COMMERCIAL_READY | Contrats privés et QA maintenus |
| Présence et lectures | COMMERCIAL_READY | Accusés explicites, lecture partielle et complète |
| Appels audio/vidéo | COMMERCIAL_READY sous configuration LiveKit Production | Contrat fournisseur et permissions maintenus |
| Appels de groupe | COMMERCIAL_READY sous capacité fournisseur configurée | Contrat multi-participants maintenu |
| Annonces et commentaires | COMMERCIAL_READY | Liens, hashtags, partage et éditeur riche stabilisés |
| Modération | COMMERCIAL_READY | Contrôles serveur et audit maintenus |

La décision propriétaire est versionnée dans `docs/STANDARD_COLLABORATION_COMMERCIAL_ACCEPTANCE_2026-08-03.md`.

## Itération 04 — Évaluation séparée

| Module | Avant l'itération | Cible maximale après Quality Gates et Production | Preuves principales | Condition commerciale restante |
|---|---|---|---|---|
| Calendrier unifié | `OPERATIONAL_UI` | `PROFESSIONAL_READY` | agrégation bornée, source canonique, déduplication, conflits existants, guide et QA | E2E multi-sources, fuseau et mobile |
| Disponibilités / exceptions | `OPERATIONAL_UI` | `PROFESSIONAL_READY` si non-régression | persistance et contrôles du calendrier existant | E2E chevauchements et confidentialité |
| Activités DTSC | `OPERATIONAL_UI` | `OPERATIONAL_UI` / à confirmer | vue transverse et guide, domaines historiques conservés | E2E des fonctions internes avant toute promotion |
| Activités entreprise | `OPERATIONAL_UI` | `PROFESSIONAL_READY` | activité sectorielle liée à une demande standard, accès et guide | E2E formulaire, assignation et notification |
| Tâches & opérations | `OPERATIONAL_UI` | `PROFESSIONAL_READY` | checklist, progression calculée, dépendances, cycles, blocages, filtres et deep link | E2E multi-utilisateur et archivage |
| Demandes internes | `OPERATIONAL_UI` | `PROFESSIONAL_READY` | information, réponse, résolution, clôture, réouverture, historique et deep link | E2E du cycle complet |
| Validations | `OPERATIONAL_UI` | `PROFESSIONAL_READY` | version soumise, correction, resoumission, délégation, décision idempotente et source synchronisée | E2E avec demandeur/validateur distincts |
| Réunions | `OPERATIONAL_UI` | `PROFESSIONAL_READY` | ordre du jour, compte rendu versionné, conflits, décisions et tâches de suivi | E2E invitations, appel et publication |
| Workflows | `OPERATIONAL_UI` | `PROFESSIONAL_READY` selon QA moteur | définitions/version/instances, acteurs serveur, idempotence et observabilité | E2E versionnement, retry et ouverture exacte du run |
| Documents | `OPERATIONAL_UI` | `PROFESSIONAL_READY` selon QA stockage | upload privé, versions, URLs signées, accès et liens canoniques multiples | E2E aperçu, URL directe, archivage et restauration |

La cible reste provisoire tant que la PR n'est pas verte, revue, fusionnée dans `main` et vérifiée en Production. Les E2E de l'itération 04 restent `NON_EXÉCUTÉ`. Aucune entrée ci-dessus ne passe à `COMMERCIAL_READY` dans cette PR.
## Itération 05 — Évaluation séparée

| Capacité | Cible automatisée | Condition commerciale restante |
|---|---|---|
| Chatbot global | `PROFESSIONAL_READY` | E2E propriétaire Production |
| Assistant IA entreprise | `PROFESSIONAL_READY` | E2E isolation, RAG et outils |
| Orchestration et fallback | `PROFESSIONAL_READY` sous configuration fournisseur | preuve des fournisseurs Production |
| Connaissance/RAG | `PROFESSIONAL_READY` | E2E multilingue et révocation |
| i18n et guides IA | `PROFESSIONAL_READY` | vérification FR/EN mobile |
| Maturité commerciale/Kanban | `PROFESSIONAL_READY` | E2E rôles et transitions |

`COMMERCIAL_READY` reste bloqué sans Production, E2E `PASSED`, preuve persistée et validation explicite du propriétaire.
