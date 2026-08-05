# Modèle d’administration professionnelle des entreprises clientes

## Frontière d’autorité

L’administration d’entreprise gère uniquement l’organisation active. Elle ne donne aucun accès à une autre organisation, aux secrets plateforme, aux rôles internes DTSC, aux journaux globaux, aux plans commerciaux globaux ni à la Console DTSC.

## Sections canoniques

1. Vue générale et checklist de configuration réelle ;
2. collaborateurs et invitations ;
3. postes ;
4. départements hiérarchiques ;
5. rôles et permissions ;
6. modules et capacités ;
7. abonnement et limites ;
8. paramètres et identité visuelle ;
9. sécurité ;
10. audit et exports ;
11. guides natifs.

## Checklist réelle

La checklist n’affiche aucun pourcentage inventé. Chaque élément provient d’un contrôle persistant : identité, responsable, départements, collaborateurs, rôles, abonnement, modules, branding, sécurité et guides. Chaque état fournit un `reasonCode` et un lien profond vers la correction.

## Collaborateurs et postes

Un collaborateur est un membership d’organisation lié à un utilisateur global. L’invitation doit être acceptée avant activation. Les changements de poste, département, responsable ou rôle recalculent les capacités. Un retrait désactive le membership, préserve l’historique, invalide le contexte et n’efface jamais l’utilisateur global.

Le dernier accès administratif critique est protégé. Une rétrogradation, suspension ou suppression qui laisserait l’organisation sans administrateur est refusée avec `LAST_ADMIN_PROTECTED`.

## Départements

Les départements supportent une relation parent/enfant. Le serveur refuse les cycles. Une structure utilisée est archivée ou transférée ; elle n’est pas supprimée brutalement. Les membres, postes, responsables et centres de coûts doivent être réaffectés avant une clôture définitive.

## Rôles et permissions

Les rôles système critiques sont protégés. Les rôles personnalisés sont tenant-scoped et possèdent un code, des permissions, des modules, un statut, un auteur et un historique. Le résolveur agrège rôle de membership, poste et rôles personnalisés. La simulation retourne décision, origine et `reasonCode` sans mutation.

## Modules et abonnement

L’activation vérifie registre canonique, implémentation réelle, plan, abonnement, dépendances et permissions. La désactivation conserve les données et bloque les nouvelles mutations selon la politique. La facturation SaaS reste sous les services canoniques de l’espace personnel et de la Console DTSC.

## Paramètres et branding

Locale, fuseau horaire, devise, formats, exercice et conservation sont persistés dans les paramètres canoniques de l’organisation. Logo, couleurs et informations de contact utilisent les uploads et validations existants. Aucun contrôle sans effet ne doit être affiché.

## Sécurité

La politique couvre durée d’inactivité, domaines autorisés, expiration et volume des invitations, rôle par défaut, approbation, MFA lorsqu’elle est disponible et approbation des exports sensibles. Toute politique est appliquée côté serveur et auditée.

## Audit

Les administrateurs autorisés peuvent filtrer les événements de leur organisation. Les exports sont limités, horodatés, localisés, audités et soumis à approbation si la politique de sécurité l’exige.
