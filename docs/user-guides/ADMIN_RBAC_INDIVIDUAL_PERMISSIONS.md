# Guide utilisateur — Permissions individuelles DTSC

## Rôle de la section

La section **Administration → Accès RBAC → Permissions individuelles DTSC** permet d’accorder un acte précis à un collaborateur sans modifier son rôle global ni son poste officiel.

Elle complète les droits accordés par rôle. Elle ne remplace pas les contrôles métier de responsabilité, d’organisation ou de propriété d’un objet.

## Conditions d’accès

Seul un administrateur connecté dans le contexte `DTSC_INTERNAL` peut gérer les permissions individuelles.

Le collaborateur ciblé doit disposer :

- d’un dossier RH actif ;
- d’un compte DTSC actif ;
- d’un lien valide entre le dossier et le compte.

## Catalogue fermé

Une permission doit appartenir au catalogue serveur. Aucun code libre n’est accepté.

Le catalogue contient notamment :

- soumettre une prestation d’une semaine passée ;
- consulter les disponibilités d’équipe ;
- déroger aux conflits autorisés ;
- gérer les ressources du calendrier ;
- gérer les SLA ;
- modifier tout statut opérationnel avec dérogation sensible ;
- lire une section Administration précise.

## Accorder une permission

1. recherchez le collaborateur ;
2. choisissez la catégorie ;
3. sélectionnez la permission ;
4. choisissez l’effet ALLOW ou DENY ;
5. ajoutez une expiration si nécessaire ;
6. renseignez un motif professionnel obligatoire ;
7. enregistrez.

## Effet ALLOW ou DENY

- **ALLOW** accorde l’acte précis ;
- **DENY** refuse explicitement cet acte.

Un DENY actif prévaut sur un ALLOW du même code.

## Durée

Une permission peut :

- commencer immédiatement ;
- rester active sans expiration ;
- expirer à une date définie ;
- être révoquée avant son expiration.

Les permissions expirées ou révoquées ne sont plus résolues dans les contrôles d’accès.

## Révocation

Cliquez sur l’action de révocation, puis renseignez le motif obligatoire.

La révocation conserve :

- l’administrateur ;
- la date ;
- le motif ;
- la permission ;
- le collaborateur ciblé.

## Exemple : semaine de prestations passée

Pour autoriser exceptionnellement un collaborateur à soumettre une ancienne semaine, accordez :

```text
work.past_period.submit
```

Sans cette permission, le bouton de soumission n’est pas visible et la route serveur refuse une tentative directe.

## Exemple : accès ciblé à Administration

Un utilisateur SUPPORT peut recevoir l’accès en lecture à une section précise, par exemple :

```text
admin.section.coo.read
```

Cela ne transforme pas l’utilisateur en COO et ne lui permet pas automatiquement de modifier les objets dont il n’est pas responsable.

## Audit

L’octroi, le remplacement et la révocation sont audités. Le motif ne doit contenir aucun secret, mot de passe ou token.

## Guide intégré dans l’application

Le bouton **Guide** dans la section Accès RBAC ouvre une version contextuelle et recherchable de ce guide.
