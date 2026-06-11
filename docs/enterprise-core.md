# Socle commun ERP des entreprises clientes

## Objectif

Le socle commun ERP fournit les objets transversaux utilisés par toutes les entreprises clientes, quel que soit leur secteur. Les modules sectoriels conservent leurs tables spécialisées et peuvent créer un objet commun lié pour organiser le travail, la validation, le reporting et la traçabilité.

Toutes les lectures et mutations sont filtrées par `organizationId`. Un collaborateur standard ne voit que les objets qu’il a créés, demandés, reçus ou qu’il doit valider. Les responsables autorisés voient les objets de leur entreprise. Un invité ne peut pas créer ni modifier un objet.

## Modules communs opérationnels

Le registre `EnterpriseCoreRecord` prend en charge les modules suivants :

- Tâches & opérations : tâches et opérations assignables avec échéance.
- Réunions & comptes rendus : réunions et comptes rendus suivis.
- Demandes internes : demandes soumises depuis Administration, Activités ou un secteur.
- Validations : décisions centralisées et motifs de rejet obligatoires.
- Documents entreprise : références documentaires reliables aux objets métier. Le fichier privé reste géré par les routes documentaires spécialisées.
- Rapports entreprise : rapports transversaux et rapports générés par les secteurs.
- Finances & budgets : budgets et dépenses de suivi commun. Les règles financières spécialisées restent dans leurs services métier dédiés.
- Fournisseurs & achats : fournisseurs et achats communs, sans remplacer les référentiels spécialisés.
- Notifications métier : signaux métier traçables. Les notifications utilisateur continuent d’utiliser `Notification`.

`EnterpriseCoreEvent` conserve les changements de statut. `EnterpriseCoreComment` conserve les commentaires. `EnterpriseEntityLink` relie un objet commun à une entité commune ou sectorielle de la même entreprise.

## Administration et Activités

Administration affiche des indicateurs issus des données réelles : tâches ouvertes, tâches en retard, validations en attente, documents récents, budgets actifs et fournisseurs actifs. Les modules communs compatibles ouvrent un espace avec recherche, pagination, formulaire guidé, détail, commentaires et actions de traitement.

Une demande créée depuis Activités entreprise génère aussi une demande commune liée. La demande initiale reste disponible dans `EnterpriseActivityRequest`, tandis que le suivi transversal est conservé dans `EnterpriseCoreRecord`.

Les libellés des formulaires sont en français métier et disposent d’une aide contextuelle. Les formulaires et listes utilisent des conteneurs `min-w-0`, des cartes responsives et des modales à hauteur bornée.

## Permissions

Les permissions communes sont centralisées dans `lib/enterprise/enterprise-core-permissions.ts`.

- `OWNER` et `ADMIN_ENTERPRISE` : lecture, création, décision et administration.
- `MANAGER` : lecture, création, mise à jour et validation, sans administration propriétaire.
- `MEMBER` : lecture et création, puis actions uniquement sur les objets qui le concernent.
- `GUEST` : lecture limitée uniquement.

Le backend réapplique toujours l’appartenance active, l’activation du module, l’entitlement et les droits du rôle.

## Intégration sectorielle et PHARMACY

Un secteur crée un objet commun avec `sourceModule`, `sourceEntityType`, `sourceEntityId` et `sectorCode`. Le service crée alors un lien `GENERATED` vers l’objet commun. Cette abstraction est compatible avec PHARMACY, HEALTH_CARE et les futurs secteurs.

Les activités PHARMACY alimentent automatiquement le socle :

- demandes de réapprovisionnement, ajustements, avis pharmacien et documents vers Demandes internes ;
- rapports caisse et inventaires vers Rapports entreprise ;
- ruptures, péremptions, anomalies, incidents qualité et actions génériques vers Tâches & opérations.

Les tables PHARMACY restent la source métier spécialisée. Le socle commun sert au suivi transversal et ne modifie pas directement les stocks, ventes, lots, caisses ou incidents.

## API

- `GET /api/enterprise/{organizationId}/core?moduleCode=...` : liste les objets visibles avec événements et commentaires récents.
- `POST /api/enterprise/{organizationId}/core` : crée un objet après validation Zod des références et permissions.
- `PATCH /api/enterprise/{organizationId}/core/{id}` : commence, soumet, demande validation, valide, rejette, termine, annule, archive ou commente.

Les mutations vérifient l’origine, appliquent un rate limit, valident les références de collaborateurs et départements, puis écrivent `AuditLog` et `ApiLog`.

## Limites restantes

- Les pièces jointes du noyau commun ne disposent pas encore d’une route d’upload privée dédiée ; les fichiers spécialisés restent gérés par les modules documentaires existants.
- La matrice de permissions par poste et les overrides utilisateur ne sont pas encore persistés dans des tables dédiées ; l’itération applique un mapping serveur strict par rôle et module.
- Les workflows communs existants sont configurables, mais leur exécution automatique étape par étape n’est pas encore migrée vers le noyau.
- Les données historiques génériques ne sont pas transformées automatiquement en `EnterpriseCoreRecord`.
