# Activités pharmacie

## Objectif

Activités pharmacie est l'espace quotidien des collaborateurs d'une organisation `PHARMACY`. Il permet d'exécuter ou de soumettre des actions guidées sans ouvrir toute l'administration sensible.

Administration PHARMACY pilote et valide les données globales. Activités PHARMACY affiche les éléments propres au collaborateur, à ses assignations et à ses permissions, puis transmet les demandes vers les modules métier concernés.

## Workflow collaborateur

Le cycle général est:

`besoin collaborateur -> activité persistée -> objet métier lié -> responsable assigné -> validation -> impact métier autorisé -> audit et notification`

Une activité suit les états `SUBMITTED`, `ASSIGNED`, `IN_PROGRESS`, `PENDING_VALIDATION`, puis `VALIDATED`, `REJECTED` ou `CANCELLED`. Les commentaires, documents associés et transitions produisent une trace persistée.

## Vues opérationnelles

Le workspace fournit dix-sept vues: tableau de bord personnel, tâches, ventes/actions du jour, validations, alertes assignées, réapprovisionnement, rupture, péremption, inventaire, ajustement stock, rapport caisse, anomalie vente, incident qualité, avis pharmacien, documents/procédures, workflows et historique.

Les KPI sont calculés depuis les données réelles et limités à l'utilisateur, sauf permission de supervision. Les montants financiers et données sensibles sont masqués sans permission.

## Connexions métier

| Activité | Objet métier créé ou mis à jour | Garde-fou |
| --- | --- | --- |
| Réapprovisionnement | `PharmacyReplenishmentRequest` | aucune commande validée automatiquement |
| Rupture / péremption | `PharmacyAlert` | déduplication et traitement ultérieur |
| Inventaire | `PharmacyInventoryLine` et session soumise | aucun ajustement stock automatique |
| Ajustement stock | `PharmacyStockAdjustment` soumis | aucun mouvement avant validation |
| Rapport caisse | `PharmacyCashSession` en attente | seul le caissier soumet, il ne valide pas |
| Anomalie vente | `PharmacySaleAnomaly` | vente et références du même tenant |
| Incident qualité | `PharmacyQualityIncident` | aucun blocage de lot automatique |
| Avis pharmacien | `PharmacyPharmacistAdviceRequest` | réponse réservée au pharmacien ciblé ou responsable |

Les documents associés proviennent de `PharmacyDocument`, doivent être visibles dans Activités et respecter la confidentialité. Les workflows affichés utilisent les workflows entreprise actifs.

## Permissions et visibilité

Tout membre actif PHARMACY voit ses propres demandes et les activités qui lui sont assignées. Les rôles de gestion `OWNER`, `ADMIN_ENTREPRISE`, `ADMIN_ENTERPRISE` et `MANAGER` peuvent superviser, assigner, valider et consulter les données sensibles/financières.

Les permissions déclarées couvrent consultation personnelle/départementale/globale, création des demandes et signalements, commentaires, documents, complétion, annulation, validation, rejet, assignation et vues sensibles. Le schéma actuel de `OrganizationMember` ne porte pas encore de poste PHARMACY dédié; le mapping fin caissier, pharmacien, magasinier, stock, achats, qualité et finance reste donc préparé par ces permissions mais appliqué aujourd'hui selon rôle et implication.

## API

| Méthode | Route | Usage |
| --- | --- | --- |
| `GET` | `/api/enterprise/[organizationId]/pharmacy/activities` | charger le tableau de bord et les référentiels autorisés |
| `POST` | `/api/enterprise/[organizationId]/pharmacy/activities` | créer une activité et son objet métier lié |
| `PATCH` | `/api/enterprise/[organizationId]/pharmacy/activities/[id]` | commenter, joindre un document, répondre, assigner ou traiter le statut |

Les routes vérifient session, membership actif, secteur PHARMACY, `organizationId`, origine pour les mutations, rate limit, validation Zod, implication/permission, AuditLog et ApiLog.

## Limites restantes

- Le mapping fin par poste PHARMACY nécessite une relation officielle entre `OrganizationMember` et les postes entreprise.
- Les validations d'une activité historisent le workflow collaborateur; la validation métier finale des ajustements, commandes, incidents et caisses reste volontairement réalisée dans leurs modules administratifs dédiés.
- Les pièces jointes associent actuellement des documents déjà autorisés du référentiel pharmacie; le téléversement d'un nouveau fichier continue de passer par le module Documents & conformité.
