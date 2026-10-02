# Hotfix #773 — Sélection fiable des sessions de caisse dans les financements

Baseline : `main@7cc7cca3a5ff352e4445b6cd9d74fbfb36130bef`.

## Problème

Dans **Trésorerie > Financements > Nouvelle entrée de fonds**, le sélecteur de session réutilisait `cashSessionEmpty` comme première option du `select`. Le contrôle fermé pouvait donc afficher « Aucune session de caisse ouverte sur ce compte » même lorsque l’API avait réellement retourné une session compatible.

Le lookup serveur était déjà correctement borné par le compte financier exact et le statut `OPEN`, mais l’UX ne distinguait pas :

- l’invite « choisissez une session » ;
- l’état vide réel ;
- le cas déterministe où une seule session compatible existe.

Cette ambiguïté bloquait la préparation du financement tant que l’utilisateur ne sélectionnait pas manuellement la session, et donnait l’impression que la session ouverte n’était pas chargée.

## Contrat corrigé

Pour un compte `CASH` :

1. le lookup conserve `organizationId + financialAccountId exact + status=OPEN` ;
2. une session d’une autre caisse n’est jamais acceptée parce qu’elle partage la devise ;
3. l’invite de sélection est neutre ;
4. l’état « aucune session » n’est rendu que lorsque la réponse est réellement vide ;
5. lorsqu’un résultat initial non filtré contient exactement une session, le sélecteur la choisit automatiquement ;
6. lorsqu’il existe plusieurs sessions, l’utilisateur choisit explicitement ;
7. la création/confirmation continue de recharger et revalider la session côté serveur.

La recherche du sélecteur est maintenant appliquée au numéro de session sans relâcher le scope du compte.

## Sécurité

Aucun contrôle n’est déplacé vers le client. `resolveOpenCashSession()` reste l’autorité lors de la mutation et refuse une session :

- d’une autre organisation ;
- d’un autre compte financier ;
- non `OPEN` ;
- ambiguë lorsque l’identifiant n’est pas fourni et que plusieurs sessions sont ouvertes.

Aucun rôle global ni aucune devise ne sert de raccourci d’autorisation.

## Données / Prisma

- migration : aucune ;
- backfill : aucun ;
- schéma : inchangé ;
- données financières historiques : inchangées.

## QA

La gate `qa:hotfix-773-funding-cash-session` protège :

- le lookup exact tenant/compte/`OPEN` ;
- la recherche par numéro ;
- la séparation placeholder / état vide ;
- la pré-sélection uniquement d’un résultat unique non filtré ;
- la revalidation backend existante ;
- l’inclusion de la gate dans `qa:regression`.

L’acceptance rendue reste propriétaire et est décrite dans `docs/OWNER_E2E_773_FUNDING_CASH_SESSION_SELECTION.md`.

## Dette de contribution

- Dette créée : aucune visée.
- Dette maintenue : aucune matérielle identifiée dans ce périmètre.
- Dette remboursée : faux état vide du sélecteur et absence de sélection déterministe d’une session unique.
- Dette reportée : aucune.

## Rollback

Revert applicatif de la PR. Aucune migration ni correction de données n’est à inverser.
