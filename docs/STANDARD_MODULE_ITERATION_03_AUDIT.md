# Audit — Modules standards, itération 03

## Base vérifiée

- SHA initial `main` : `dda6de23791520dacad090c89ed0542b3cb9be94`.
- Itération 1 : PR #58, fusion `f9055ce47824285710e3bc0dd1adfdd920512075`.
- Itération 2 : PR #59, fusion `dda6de23791520dacad090c89ed0542b3cb9be94`.

## Corrections structurantes

- suppression de l’annuaire global de 500 utilisateurs ;
- résolution idempotente des conversations directes ;
- contexte et participants explicites ;
- messages avec clé client, réponses contrôlées, lectures réelles, réactions, épinglage, pièces jointes privées et signalement ;
- propriétaire de groupe explicite et transfert obligatoire avant départ ;
- présence fondée sur heartbeat persistant ;
- appels avec disponibilité fournisseur, expiration de sonnerie, refus, annulation, appel manqué et durée serveur ;
- annonces avec audience serveur, brouillons privés, commentaires bornés, réactions, mentions, suppression logique et modération ;
- notifications et liens profonds dédupliqués ;
- documentation et guides exacts.

## Limites honnêtes

- la synchronisation de secours utilise encore un polling borné ;
- la programmation d’annonce est refusée tant qu’un exécuteur fiable n’est pas configuré ;
- aucun antivirus tiers n’est configuré ;
- les appels nécessitent la configuration LiveKit et la capacité STUN/TURN du fournisseur ;
- les E2E manuels restent à exécuter par le propriétaire.

## Maturité

`COLLABORATORS` et `ANNOUNCEMENTS` peuvent atteindre `PROFESSIONAL_READY` après passage de toutes les Quality Gates. Les sous-capacités appels, médias, commentaires et modération restent évaluées séparément dans `STANDARD_MODULE_COMMERCIAL_READINESS.md`.

Aucune promotion vers `COMMERCIAL_READY` n’est réalisée.
