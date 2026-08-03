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
